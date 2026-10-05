import { AuthService } from './auth.service';

describe('tenant profile employee limit', () => {
  it('keeps the administrator limit when a tenant submits profile changes', async () => {
    const user: any = {
      role: 'tenant',
      _id: 'tenant',
      email: 'tenant@example.com',
      fullName: 'Петров Иван',
      lastName: 'Петров',
      firstName: 'Иван',
      phone: '',
      company: '',
      companyShortName: '',
      profileType: 'individual',
      employeeLimit: 3,
      markModified: jest.fn(),
      save: jest.fn(async () => undefined),
    };
    const service: any = Object.create(AuthService.prototype);
    service.userModel = { findById: async () => user };
    service.auditService = { log: jest.fn() };
    service.getUserOffices = async () => [];
    service.toUserDto = async () => ({ id: 'tenant' });
    await service.requestProfileChange('tenant', {
      lastName: 'Смирнов',
      firstName: 'Иван',
      employeeLimit: 200,
    });
    expect(user.profileChangeRequest.lastName).toBe('Смирнов');
    expect(user.profileChangeRequest.employeeLimit).toBe(3);
    expect(user.employeeLimit).toBe(3);
    expect(user.save).toHaveBeenCalledTimes(1);
  });
});
