import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Pass, PassDocument } from '../schemas';
import { CreatePassDto } from './dto/create-pass.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@Injectable()
export class PassesService {
  constructor(@InjectModel(Pass.name) private passModel: Model<PassDocument>) {}

  private generatePassNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `PS-${year}-${random}`;
  }

  async findAll(params: { status?: string; date?: string; search?: string }) {
    const filter: any = {};

    if (params.status) filter.status = params.status;
    if (params.date) filter.visitDate = params.date;

    if (params.search) {
      filter.$or = [
        { visitorName: new RegExp(params.search, 'i') },
        { vehiclePlate: new RegExp(params.search, 'i') },
        { companyName: new RegExp(params.search, 'i') },
      ];
    }

    const passes = await this.passModel.find(filter).sort({ createdAt: -1 }).lean();
    return { passes: passes.map(this.mapToFrontend) };
  }

  async findOne(id: string) {
    const pass = await this.passModel.findById(id).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    return { pass: this.mapToFrontend(pass) };
  }

  async create(dto: CreatePassDto, user: any) {
    const passNumber = this.generatePassNumber();

    const doc = await this.passModel.create({
      ...dto,
      passNumber,
      status: 'pending',
      createdBy: user?.userId,
      creatorName: user?.email,
    });

    return { pass: this.mapToFrontend(doc) };
  }

  async updateStatus(id: string, dto: UpdateStatusDto, actor?: any) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = dto.status;
    if (dto.rejectionReason) pass.rejectionReason = dto.rejectionReason;

    if (dto.status === 'approved') {
      pass.approvedAt = new Date().toISOString();
      pass.approverName = actor?.email || 'admin';
    }

    await pass.save();
    return { pass: this.mapToFrontend(pass) };
  }

  async checkIn(id: string) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = 'active';
    pass.checkedInAt = new Date().toISOString();
    await pass.save();
    return { pass: this.mapToFrontend(pass) };
  }

  async checkOut(id: string) {
    const pass = await this.passModel.findById(id);
    if (!pass) throw new NotFoundException('Пропуск не найден');

    pass.status = 'completed';
    pass.checkedOutAt = new Date().toISOString();
    await pass.save();
    return { pass: this.mapToFrontend(pass) };
  }

  async getJournal(date?: string) {
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const passes = await this.passModel
      .find({ visitDate: targetDate })
      .sort({ createdAt: -1 })
      .lean();

    const mapped = passes.map(this.mapToFrontend);

    const stats = {
      total: mapped.length,
      pending: mapped.filter(p => p.status === 'pending').length,
      active: mapped.filter(p => p.status === 'active').length,
      completed: mapped.filter(p => p.status === 'completed').length,
      approved: mapped.filter(p => p.status === 'approved').length,
    };

    return { date: targetDate, stats, passes: mapped };
  }

  async lookup(passNumber: string) {
    const pass = await this.passModel.findOne({ passNumber }).lean();
    if (!pass) throw new NotFoundException('Пропуск не найден');
    return { pass: this.mapToFrontend(pass) };
  }

  async getStats() {
    const today = new Date().toISOString().slice(0, 10);
    const passes = await this.passModel.find().lean();

    const todayPasses = passes.filter(p => p.visitDate === today);

    return {
      today,
      todayCount: todayPasses.length,
      weekCount: passes.length, // simplified
      byStatus: this.countBy(passes, 'status'),
      todayByType: this.countBy(todayPasses, 'passType'),
    };
  }

  private countBy(arr: any[], key: string) {
    return arr.reduce((acc, item) => {
      const val = item[key] || 'unknown';
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private mapToFrontend(doc: any) {
    return {
      id: doc._id.toString(),
      passNumber: doc.passNumber,
      createdBy: doc.createdBy?.toString() || '',
      creatorName: doc.creatorName,
      creatorCompany: doc.creatorCompany,
      visitorName: doc.visitorName,
      visitorPhone: doc.visitorPhone,
      companyName: doc.companyName,
      visitPurpose: doc.visitPurpose,
      passType: doc.passType,
      vehiclePlate: doc.vehiclePlate,
      vehicleModel: doc.vehicleModel,
      visitDate: doc.visitDate,
      visitTimeFrom: doc.visitTimeFrom,
      visitTimeTo: doc.visitTimeTo,
      office: doc.office,
      floor: doc.floor,
      comment: doc.comment,
      status: doc.status,
      approvedBy: doc.approvedBy,
      approverName: doc.approverName,
      approvedAt: doc.approvedAt,
      rejectionReason: doc.rejectionReason,
      checkedInAt: doc.checkedInAt,
      checkedInBy: doc.checkedInBy,
      checkerInName: doc.checkerInName,
      checkedOutAt: doc.checkedOutAt,
      checkedOutBy: doc.checkedOutBy,
      checkerOutName: doc.checkerOutName,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
