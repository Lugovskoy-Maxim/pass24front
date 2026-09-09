import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import * as webPush from 'web-push';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import {
  NativePushDevice,
  NativePushDeviceDocument,
  PushSubscription,
  PushSubscriptionDocument,
  User,
  UserDocument,
  VapidConfig,
  VapidConfigDocument,
} from '../schemas';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';
import { SaveNativePushTokenDto } from './dto/save-native-push-token.dto';
import { RenewPushSubscriptionDto } from './dto/renew-push-subscription.dto';

type GuestArrival = {
  id: string;
  createdBy?: Types.ObjectId;
  visitorName: string;
  office: string;
  businessCenterName?: string;
  passNumber: string;
};

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private enabled = false;
  private publicKey: string | null = null;

  constructor(
    @InjectModel(PushSubscription.name, AUTH_CONNECTION)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    @InjectModel(NativePushDevice.name, AUTH_CONNECTION)
    private readonly nativeDeviceModel: Model<NativePushDeviceDocument>,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(VapidConfig.name, AUTH_CONNECTION)
    private readonly vapidConfigModel: Model<VapidConfigDocument>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const envPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
      const envPrivateKey = this.config
        .get<string>('VAPID_PRIVATE_KEY')
        ?.trim();
      const subject =
        this.config.get<string>('VAPID_SUBJECT')?.trim() ||
        'mailto:admin@pass24.local';

      let publicKey = envPublicKey;
      let privateKey = envPrivateKey;
      if (!publicKey || !privateKey) {
        let stored = await this.vapidConfigModel
          .findOne({ key: 'default' })
          .select('+privateKey')
          .lean();
        if (!stored) {
          const generated = webPush.generateVAPIDKeys();
          stored = await this.vapidConfigModel
            .findOneAndUpdate(
              { key: 'default' },
              {
                $setOnInsert: {
                  key: 'default',
                  publicKey: generated.publicKey,
                  privateKey: generated.privateKey,
                  subject,
                },
              },
              { upsert: true, returnDocument: 'after' },
            )
            .select('+privateKey')
            .lean();
          this.logger.log(
            'Generated persistent VAPID keys in the auth database',
          );
        }
        publicKey = stored.publicKey;
        privateKey = stored.privateKey;
      }

      webPush.setVapidDetails(subject, publicKey, privateKey);
      this.publicKey = publicKey;
      this.enabled = true;
    } catch (error: any) {
      this.logger.error(
        `Web Push initialization failed: ${error?.message || error}`,
      );
    }
  }

  getPublicConfig() {
    return {
      enabled: this.enabled,
      publicKey: this.enabled ? this.publicKey : null,
    };
  }

  async saveSubscription(
    userId: string,
    dto: SavePushSubscriptionDto,
    userAgent?: string,
  ) {
    const renewalToken = randomBytes(32).toString('base64url');
    await this.subscriptionModel.findOneAndUpdate(
      { endpoint: dto.endpoint },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          renewalTokenHash: this.hashRenewalToken(renewalToken),
          userAgent: userAgent?.slice(0, 500),
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return { subscribed: true, renewalToken };
  }

  async renewSubscription(dto: RenewPushSubscriptionDto) {
    const subscription = await this.subscriptionModel
      .findOne({ renewalTokenHash: this.hashRenewalToken(dto.renewalToken) })
      .select('+renewalTokenHash');
    if (!subscription) return { subscribed: false };

    subscription.endpoint = dto.endpoint;
    subscription.p256dh = dto.keys.p256dh;
    subscription.auth = dto.keys.auth;
    await subscription.save();
    return { subscribed: true };
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.subscriptionModel.deleteOne({
      userId: new Types.ObjectId(userId),
      endpoint,
    });
    return { subscribed: false };
  }

  async saveNativeToken(userId: string, dto: SaveNativePushTokenDto) {
    const provider = dto.provider === 'fcm' || dto.provider === 'google'
      ? 'firebase'
      : dto.provider === 'rustore'
        ? 'rustore'
        : 'firebase';
    await this.nativeDeviceModel.findOneAndUpdate(
      { token: dto.token },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          provider,
          token: dto.token,
        },
      },
      { upsert: true, new: true },
    );
    return { registered: true, provider };
  }

  private async pushToTenant(
    tenantId: string,
    message: {
      title: string;
      body: string;
      tag: string;
      url: string;
      extra?: Record<string, unknown>;
      topic?: string;
    },
  ) {
    const recipients = await this.userModel
      .find({
        $or: [
          { _id: new Types.ObjectId(tenantId) },
          { parentTenantId: new Types.ObjectId(tenantId) },
        ],
        isActive: true,
        isBlocked: { $ne: true },
      })
      .select('_id')
      .lean();
    const recipientIds = recipients.map((recipient) => recipient._id);
    if (!recipientIds.length) return;
    if (!this.enabled) {
      await this.pushToNativeDevices(recipientIds, message);
      return;
    }
    const subscriptions = await this.subscriptionModel
      .find({ userId: { $in: recipientIds } })
      .select('+p256dh +auth')
      .lean();
    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      tag: message.tag,
      url: message.url,
      ...message.extra,
    });
    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth,
                },
              },
              payload,
              {
                TTL: 3600,
                urgency: 'high',
                timeout: 5000,
                topic: (message.topic || message.tag).slice(-32),
              },
            );
            return;
          } catch (error: any) {
            // 404/410 = endpoint gone. 401/403 = VAPID mismatch or revoked
            // FCM token; retrying these on every guest arrival only spams logs.
            if ([401, 403, 404, 410].includes(error?.statusCode)) {
              await this.subscriptionModel.deleteOne({
                _id: subscription._id,
              });
              return;
            }
            const transient =
              error?.statusCode === 408 ||
              error?.statusCode === 429 ||
              error?.statusCode >= 500;
            if (attempt === 0 && transient) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
            this.logger.warn(
              `Web Push delivery failed: ${error?.statusCode || error?.message || error}`,
            );
            return;
          }
        }
      }),
    );
    await this.pushToNativeDevices(recipientIds, message);
  }

  private async pushToNativeDevices(
    recipientIds: Types.ObjectId[],
    message: {
      title: string;
      body: string;
      tag: string;
      url: string;
      extra?: Record<string, unknown>;
    },
  ) {
    const devices = await this.nativeDeviceModel
      .find({ userId: { $in: recipientIds } })
      .lean();
    if (!devices.length) return;
    await Promise.allSettled(
      devices.map((device) =>
        device.provider === 'firebase'
          ? this.sendFirebase(device.token, message)
          : this.sendRuStore(device.token, message),
      ),
    );
  }

  private async sendFirebase(
    token: string,
    message: {
      title: string;
      body: string;
      tag: string;
      url: string;
      extra?: Record<string, unknown>;
    },
  ) {
    const serverKey = this.config.get<string>('FCM_SERVER_KEY')?.trim();
    if (!serverKey) return;
    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        priority: 'high',
        notification: { title: message.title, body: message.body },
        data: {
          title: message.title,
          body: message.body,
          tag: message.tag,
          url: message.url,
          ...(message.extra || {}),
        },
      }),
    });
    if (!response.ok && [400, 404].includes(response.status)) {
      await this.nativeDeviceModel.deleteOne({ token, provider: 'firebase' });
    }
  }

  private async sendRuStore(
    token: string,
    message: {
      title: string;
      body: string;
      tag: string;
      url: string;
      extra?: Record<string, unknown>;
    },
  ) {
    const projectId = this.config.get<string>('RUSTORE_PUSH_PROJECT_ID')?.trim();
    const serviceToken = this.config
      .get<string>('RUSTORE_PUSH_SERVICE_TOKEN')
      ?.trim();
    if (!projectId || !serviceToken) return;
    const response = await fetch(
      `https://vkpns.rustore.ru/v1/projects/${encodeURIComponent(projectId)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokens: [token],
          message: {
            notification: { title: message.title, body: message.body },
            data: {
              title: message.title,
              body: message.body,
              tag: message.tag,
              url: message.url,
              ...(message.extra || {}),
            },
          },
        }),
      },
    );
    if (!response.ok && [400, 404].includes(response.status)) {
      await this.nativeDeviceModel.deleteOne({ token, provider: 'rustore' });
    }
  }

  private hashRenewalToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async notifyOfficeStatus(input: {
    tenantId: string;
    officeLabel: string;
    paymentStatus: string;
    paidUntil?: string;
  }): Promise<void> {
    const label =
      input.paymentStatus === 'overdue'
        ? 'Просрочена оплата офиса'
        : 'Офис не оплачен';
    const until = input.paidUntil
      ? ` до ${input.paidUntil}`
      : '';
    await this.pushToTenant(input.tenantId, {
      title: label,
      body: `${input.officeLabel}${until}`,
      tag: `office-pay-${input.tenantId}-${input.paymentStatus}`,
      url: '/profile',
    });
  }

  async notifyGuestArrival(pass: GuestArrival): Promise<void> {
    if (!pass.createdBy) return;

    try {
      const creator = await this.userModel
        .findById(pass.createdBy)
        .select('role parentTenantId')
        .lean();
      if (!creator || (creator.role !== 'tenant' && !creator.parentTenantId))
        return;

      const ownerId = creator.parentTenantId || creator._id;
      await this.pushToTenant(ownerId.toString(), {
        title: 'Ваш гость пришёл',
        body: `${pass.visitorName} · офис ${pass.office}${pass.businessCenterName ? ` · ${pass.businessCenterName}` : ''}`,
        tag: `guest-arrival-${pass.id}`,
        url: `/passes?id=${encodeURIComponent(pass.id)}`,
        extra: { passNumber: pass.passNumber },
        topic: pass.id.slice(-32),
      });
    } catch (error: any) {
      this.logger.error(
        `Guest arrival notification failed for ${pass.id}: ${error?.message || error}`,
      );
    }
  }
}
