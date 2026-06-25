import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  @Get('dashboard')
  dashboard() {
    return {
      stats: {
        users: { total: 12, byRole: { tenant: 9, security: 2, admin: 1 } },
        passes: { total: 245, today: 18, week: 87, byStatus: { active: 4, completed: 12, pending: 2 } },
        revenue: { monthlyTotal: 125000, businessCenters: 1 },
      },
      recentActivity: [],
      settings: {},
    };
  }

  @Get('users')
  getUsers(@Query() q: any) {
    return { users: [] };
  }

  @Get('business-centers')
  getBusinessCenters() {
    return { businessCenters: [] };
  }

  @Get('pricing')
  getPricing() {
    return {
      plans: [
        { id: '1', name: 'Базовый', priceMonthly: 11500, maxOffices: 50, features: [], isActive: true },
      ],
    };
  }

  @Get('offices')
  getOffices() {
    return { offices: [] };
  }

  @Get('audit')
  getAudit(@Query('offset') offset = 0) {
    return { entries: [], total: 0 };
  }

  @Get('settings')
  getSettings() {
    return {
      settings: {
        business_center_name: 'БЦ PASS24',
        max_passes_per_day: '200',
      },
    };
  }

  @Get('blacklist')
  getBlacklist() {
    return { entries: [] };
  }

  @Get('reports/daily')
  getDailyReport(@Query('date') date?: string) {
    return { date: date || new Date().toISOString().slice(0, 10), summary: [], visitors: [] };
  }
}
