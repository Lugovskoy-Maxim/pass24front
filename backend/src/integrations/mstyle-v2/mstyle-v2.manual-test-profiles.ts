export const MANUAL_TEST_DEFAULT_DELIVERY_EMAIL = 'ninzak@ya.ru';

export interface ManualTestIdentityFixture {
  key: string;
  title: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  email: string;
  phone: string;
  role: 'owner' | 'employee';
}

export interface ManualTestProfileFixture {
  key: string;
  title: string;
  type: 'company' | 'individual';
  legalForm: 'ooo' | 'ip' | null;
  companyShortName: string | null;
  employeeLimit: number | null;
  owner: ManualTestIdentityFixture;
  employees: ManualTestIdentityFixture[];
  privateData: Record<string, unknown>;
}

const BANK = {
  name: 'ПАО Сбербанк',
  bik: '044525225',
  correspondentAccountNumber: '30101810400000000225',
};

export const MANUAL_TEST_PROFILES: readonly ManualTestProfileFixture[] = [
  {
    key: 'roga-i-kopyta',
    title: 'ООО «Рога и копыта»',
    type: 'company',
    legalForm: 'ooo',
    companyShortName: 'Рога и копыта',
    employeeLimit: 5,
    owner: {
      key: 'roga-owner',
      title: 'Владелец ООО «Рога и копыта»',
      fullName: 'Козлов Остап Ибрагимович',
      lastName: 'Козлов',
      firstName: 'Остап',
      middleName: 'Ибрагимович',
      email: 'roga.owner@manual.pass.mstyle.ru',
      phone: '+79990001001',
      role: 'owner',
    },
    employees: [
      {
        key: 'roga-employee',
        title: 'Сотрудник ООО «Рога и копыта»',
        fullName: 'Сотрудников Сергей Сергеевич',
        lastName: 'Сотрудников',
        firstName: 'Сергей',
        middleName: 'Сергеевич',
        email: 'roga.employee@manual.pass.mstyle.ru',
        phone: '+79990001002',
        role: 'employee',
      },
    ],
    privateData: {
      company: {
        fullName: 'Общество с ограниченной ответственностью «Рога и копыта»',
        inn: '7701234560',
        kpp: '770101001',
        ogrn: '1237700123451',
        legalAddress: 'г. Москва, ул. Тестовая, д. 1',
        actualAddress: 'г. Москва, ул. Тестовая, д. 1, офис 101',
        generalDirector: 'Козлов Остап Ибрагимович',
      },
      representative: {
        fullName: 'Козлов Остап Ибрагимович',
        birthDate: '1980-04-01',
      },
      bank: {
        ...BANK,
        accountNumber: '40702810500000001001',
      },
    },
  },
  {
    key: 'romashka',
    title: 'ООО «Ромашка»',
    type: 'company',
    legalForm: 'ooo',
    companyShortName: 'Ромашка',
    employeeLimit: 2,
    owner: {
      key: 'romashka-owner',
      title: 'Владелец ООО «Ромашка»',
      fullName: 'Ромашкина Мария Ивановна',
      lastName: 'Ромашкина',
      firstName: 'Мария',
      middleName: 'Ивановна',
      email: 'romashka.owner@manual.pass.mstyle.ru',
      phone: '+79990002001',
      role: 'owner',
    },
    employees: [],
    privateData: {
      company: {
        fullName: 'Общество с ограниченной ответственностью «Ромашка»',
        inn: '7702234563',
        kpp: '770201001',
        ogrn: '1237700223452',
        legalAddress: 'г. Москва, Ромашковый пер., д. 2',
        actualAddress: 'г. Москва, Ромашковый пер., д. 2',
        generalDirector: 'Ромашкина Мария Ивановна',
      },
      representative: {
        fullName: 'Ромашкина Мария Ивановна',
        birthDate: '1985-05-15',
      },
      bank: {
        ...BANK,
        accountNumber: '40702810100000002002',
      },
    },
  },
  {
    key: 'ip-testov',
    title: 'ИП Тестов Тест Тестович',
    type: 'company',
    legalForm: 'ip',
    companyShortName: 'ИП Тестов',
    employeeLimit: 3,
    owner: {
      key: 'ip-testov-owner',
      title: 'Индивидуальный предприниматель',
      fullName: 'Тестов Тест Тестович',
      lastName: 'Тестов',
      firstName: 'Тест',
      middleName: 'Тестович',
      email: 'ip.testov@manual.pass.mstyle.ru',
      phone: '+79990003001',
      role: 'owner',
    },
    employees: [],
    privateData: {
      entrepreneur: {
        inn: '770123456703',
        ogrnip: '326770012345671',
        registrationAddress: 'г. Москва, ул. Предпринимательская, д. 3',
      },
      representative: {
        fullName: 'Тестов Тест Тестович',
        birthDate: '1979-03-03',
      },
      bank: {
        ...BANK,
        accountNumber: '40802810600000003003',
      },
    },
  },
  {
    key: 'individual-testova',
    title: 'Тестова Анна Петровна',
    type: 'individual',
    legalForm: null,
    companyShortName: null,
    employeeLimit: 0,
    owner: {
      key: 'individual-testova-owner',
      title: 'Физическое лицо',
      fullName: 'Тестова Анна Петровна',
      lastName: 'Тестова',
      firstName: 'Анна',
      middleName: 'Петровна',
      email: 'individual.testova@manual.pass.mstyle.ru',
      phone: '+79990004001',
      role: 'owner',
    },
    employees: [],
    privateData: {
      individual: {
        birthDate: '1990-06-20',
        inn: '770223456707',
        registrationAddress: 'г. Москва, ул. Физическая, д. 4, кв. 4',
        passport: {
          fullName: 'Тестова Анна Петровна',
          gender: 'female',
          birthDate: '1990-06-20',
          number: '4500 000004',
          departmentCode: '770-004',
          issuedDate: '2010-07-01',
          issuedBy: 'Отделом УФМС России по тестовым данным',
        },
      },
    },
  },
] as const;

export const MANUAL_TEST_IDENTITIES = MANUAL_TEST_PROFILES.flatMap((profile) =>
  [profile.owner, ...profile.employees].map((identity) => ({
    ...identity,
    profileKey: profile.key,
  })),
);

export function findManualTestIdentity(type: 'email' | 'phone', value: string) {
  const normalized = type === 'email' ? value.trim().toLowerCase() : value;
  return MANUAL_TEST_IDENTITIES.find(
    (identity) => identity[type].toLowerCase() === normalized.toLowerCase(),
  );
}
