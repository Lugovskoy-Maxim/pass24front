import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Binary } from 'mongodb';
import { RequireAllPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { OperationsStore } from '../operations/operations.store';

const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const VIDEO_ID = 'standby';

@Controller('kiosk/standby')
export class KioskStandbyController {
  constructor(private readonly store: OperationsStore) {}

  private videos() {
    return this.store.collection<{
      _id: string;
      version: string;
      contents: Binary;
    }>('kiosk_media');
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  async status() {
    const video = await this.videos().findOne(
      { _id: VIDEO_ID },
      { projection: { version: 1 } },
    );
    return { version: video?.version ?? null };
  }

  @Put()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequireAllPermissions('admin.panel', 'admin.settings')
  @UseInterceptors(
    FileInterceptor('video', {
      limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 0 },
    }),
  )
  async upload(@UploadedFile() file?: { buffer: Buffer }) {
    const data = file?.buffer;
    if (
      !data ||
      data.length < 16 ||
      data.length > MAX_VIDEO_BYTES ||
      data.toString('ascii', 4, 8) !== 'ftyp' ||
      data.readUInt32BE(0) < 16 ||
      data.readUInt32BE(0) > data.length
    ) {
      throw new BadRequestException('Выберите видео MP4 размером до 10 МБ.');
    }
    const version = randomUUID();
    await this.videos().updateOne(
      { _id: VIDEO_ID },
      { $set: { version, contents: new Binary(data) } },
      { upsert: true },
    );
    return { version };
  }

  @Delete()
  @UseGuards(AuthGuard('jwt'), PermissionsGuard)
  @RequireAllPermissions('admin.panel', 'admin.settings')
  async reset() {
    await this.videos().deleteOne({ _id: VIDEO_ID });
    return { version: null };
  }

  @Get('video/:version')
  async video(@Req() req: Request, @Res() res: Response) {
    const version = req.params.version;
    if (typeof version !== 'string' || !/^[a-f\d-]{36}$/.test(version))
      throw new NotFoundException();
    const video = await this.videos().findOne({ _id: VIDEO_ID, version });
    if (!video) throw new NotFoundException();
    const data = Buffer.from(video.contents.value());
    const range = req.range(data.length, { combine: true });
    res.set({
      'Cache-Control': 'public, max-age=86400, immutable',
      'Accept-Ranges': 'bytes',
      'Content-Type': 'video/mp4',
      'X-Content-Type-Options': 'nosniff',
    });
    if (range === -1) {
      res.status(416).set('Content-Range', `bytes */${data.length}`).end();
    } else if (
      Array.isArray(range) &&
      range.type === 'bytes' &&
      range.length === 1
    ) {
      const { start, end } = range[0];
      res
        .status(206)
        .set('Content-Range', `bytes ${start}-${end}/${data.length}`)
        .send(data.subarray(start, end + 1));
    } else {
      res.send(data);
    }
  }
}
