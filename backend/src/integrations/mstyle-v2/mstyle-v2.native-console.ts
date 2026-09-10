import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { verify } from 'jsonwebtoken';
import { AUTH_CONNECTION } from '../../database/auth-database.constants';
import { User } from '../../schemas';
import { adminAssertionError } from './mstyle-v2.assertions';

/** Compatibility for the existing native console; external OAuth clients cannot use this verifier. */
@Injectable()
export class MstyleNativeConsoleProof {
  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name, AUTH_CONNECTION)
    private readonly users: Model<User>,
  ) {}
  async verify(token: string) {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) adminAssertionError('invalid');
    let claims: any;
    try {
      claims = verify(token, secret, { algorithms: ['HS256'] });
    } catch {
      adminAssertionError('invalid');
    }
    if (
      !claims ||
      !/^[a-f0-9]{24}$/i.test(claims.sub) ||
      !Number.isFinite(claims.exp)
    )
      adminAssertionError('invalid');
    const user = await this.users.findById(claims.sub);
    if (
      !user ||
      user.role !== 'admin' ||
      user.invitePending ||
      user.isBlocked ||
      (user.parentTenantId && user.isActive === false)
    )
      adminAssertionError('invalid');
    return String(user._id);
  }
}
