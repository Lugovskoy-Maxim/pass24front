import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as webPush from 'web-push';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { PushSubscription, PushSubscriptionDocument, User, UserDocument } from '../schemas';
import { SavePushSubscriptionDto } from './dto/save-push-subscription.dto';

type GuestArrival = {
  id: string;
  createdBy?: Types.ObjectId;
  visitorName: string;
  office: string;
  businessCenterName?: string;
  passNumber: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly enabled: boolean;

  constructor(
    @InjectModel(PushSubscription.name, AUTH_CONNECTION)
    private readonly subscriptionModel: Model<PushSubscriptionDocument>,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly userModel: Model<UserDocument>,
    private readonly config: ConfigService,
  ) {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    this.enabled = !!publicKey && !!privateKey;
    if (this.enabled) {
      webPush.setVapidDetails(
        this.config.get<string>('VAPID_SUBJECT') || 'mailto:admin@pass24.local',
        publicKey!,
        privateKey!,
      );
    } else {
      this.logger.warn('Web Push disabled: VAPID keys are not configured');
    }
  }

  getPublicConfig() {
    return {
      enabled: this.enabled,
      publicKey: this.enabled ? this.config.get<string>('VAPID_PUBLIC_KEY') : null,
    };
  }

  async saveSubscription(userId: string, dto: SavePushSubscriptionDto, userAgent?: string) {
    await this.subscriptionModel.findOneAndUpdate(
      { endpoint: dto.endpoint },
      {
        $set: {
          userId: new Types.ObjectId(userId),
          endpoint: dto.endpoint,
          p256dh: dto.keys.p256dh,
          auth: dto.keys.auth,
          userAgent: userAgent?.slice(0, 500),
        },
      },
      { upsert: true, new: true },
    );
    return { subscribed: true };
  }

  async removeSubscription(userId: string, endpoint: string) {
    await this.subscriptionModel.deleteOne({ userId: new Types.ObjectId(userId), endpoint });
    return { subscribed: false };
  }

  async notifyGuestArrival(pass: GuestArrival): Promise<void> {
    if (!this.enabled || !pass.createdBy) return;

    try {
      const creator = await this.userModel.findById(pass.createdBy).select('role parentTenantId').lean();
      if (!creator || (creator.role !== 'tenant' && !creator.parentTenantId)) return;

      const ownerId = creator.parentTenantId || creator._id;
      const recipients = await this.userModel
        .find({
          $or: [{ _id: ownerId }, { parentTenantId: ownerId }],
          isActive: true,
          isBlocked: { $ne: true },
        })
        .select('_id')
        .lean();
      const recipientIds = recipients.map((recipient) => recipient._id);
      if (!recipientIds.length) return;
      const subscriptions = await this.subscriptionModel
        .find({ userId: { $in: recipientIds } })
        .select('+p256dh +auth')
        .lean();

      const payload = JSON.stringify({
        title: 'Ваш гость пришёл',
        body: `${pass.visitorName} · офис ${pass.office}${pass.businessCenterName ? ` · ${pass.businessCenterName}` : ''}`,
        tag: `guest-arrival-${pass.id}`,
        url: `/passes?id=${encodeURIComponent(pass.id)}`,
        passNumber: pass.passNumber,
      });

      await Promise.allSettled(
        subscriptions.map(async (subscription) => {
          try {
            await webPush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: { p256dh: subscription.p256dh, auth: subscription.auth },
              },
              payload,
              { TTL: 3600, urgency: 'high', timeout: 5000 },
            );
          } catch (error: any) {
            if (error?.statusCode === 404 || error?.statusCode === 410) {
              await this.subscriptionModel.deleteOne({ _id: subscription._id });
              return;
            }
            this.logger.warn(`Web Push delivery failed: ${error?.statusCode || error?.message || error}`);
          }
        }),
      );
    } catch (error: any) {
      this.logger.error(`Guest arrival notification failed for ${pass.id}: ${error?.message || error}`);
    }
  }
}
