import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AUTH_CONNECTION } from '../database/auth-database.constants';
import { User, UserDocument } from '../schemas';
import { TenantEmployeeCategoryService } from './tenant-employee-category.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name, AUTH_CONNECTION) private userModel: Model<UserDocument>,
    private categoryService: TenantEmployeeCategoryService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: any) {
    const user = await this.userModel.findById(payload.sub);
    if (!user || user.isActive === false) {
      throw new UnauthorizedException();
    }
    const permissions = await this.categoryService.resolveUserPermissions(user);
    return {
      userId: payload.sub,
      email: payload.email,
      role: user.role || payload.role,
      fullName: user.fullName,
      parentTenantId: user.parentTenantId?.toString(),
      permissions,
    };
  }
}
