import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Request } from 'express';
import { AccessConfigService } from '../access/access-config.service';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { User, UserDocument } from '../schemas';

/**
 * JWT → req.user для AuthGuard('jwt').
 * Permissions подгружаются из access_config на каждый запрос (актуально после смены прав).
 * Отключённый сотрудник (parentTenantId + isActive=false) отклоняется — даже со старым токеном.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name, AUTH_CONNECTION)
    private userModel: Model<UserDocument>,
    private accessConfigService: AccessConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(request: Request, payload: any) {
    if (payload.kioskRoomId !== undefined) {
      const path = request.originalUrl.split('?')[0];
      const bookingRead =
        request.method === 'GET' &&
        (path === '/api/office-services/bookings/context' ||
          path ===
            `/api/office-services/bookings/rooms/${payload.kioskRoomId}/slots`);
      const bookingWrite =
        request.method === 'POST' &&
        (path === '/api/office-services/bookings/quote' ||
          path === '/api/office-services/bookings/kiosk');
      if (!bookingRead && !bookingWrite) throw new UnauthorizedException();
    }
    const user = await this.userModel.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.invitePending) {
      throw new UnauthorizedException(
        'Аккаунт не активирован. Откройте ссылку из письма-приглашения.',
      );
    }
    if (user.parentTenantId && user.isActive === false) {
      throw new UnauthorizedException(
        'Учётная запись отключена владельцем компании',
      );
    }
    if (user.isBlocked) {
      throw new UnauthorizedException('Учётная запись заблокирована');
    }
    const permissions = await this.accessConfigService.getPermissionsForRole(
      user.role || 'tenant',
    );
    // Форма req.user, которую ждут controllers (userId, не sub)
    return {
      userId: payload.sub,
      kioskRoomId: payload.kioskRoomId,
      email: payload.email,
      role: user.role || payload.role,
      fullName: user.fullName,
      company: user.company,
      parentTenantId: user.parentTenantId?.toString(),
      isActive: user.isActive !== false,
      permissions,
      /** БЦ, закреплённые за security / bc_admin */
      propertyIds: (user.properties || []).map((p) => p.toString()),
    };
  }
}
