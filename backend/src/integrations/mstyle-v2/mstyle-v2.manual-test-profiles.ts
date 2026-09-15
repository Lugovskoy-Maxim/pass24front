export const MANUAL_TEST_DEFAULT_DELIVERY_EMAIL = 'ninzak@ya.ru';

export interface ManualTestIdentityFixture {
  key: string;
  title: string;
  fullName: string;
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate?: string;
  email: string;
  phone: string;
  role: 'owner' | 'employee';
}

export interface ManualTestGuestContactFixture {
  key: string;
  title: string;
  phone: string;
  role: 'guest';
  birthDate?: never;
}

export interface ManualTestProfileFixture {
  key: string;
  title: string;
  type: 'company' | 'individual';
  legalForm: 'ooo' | 'ip' | null;
  companyShortName: string | null;
  employeeLimit: number | null;
  editPolicy: 'self_service' | 'request_only';
  owner: ManualTestIdentityFixture;
  employees: ManualTestIdentityFixture[];
  employeeCandidates: ManualTestIdentityFixture[];
  scenario: {
    description: string;
    balanceMinutes: number;
    employeeBalanceMinutes: number;
    accrualOffsetDays: number | null;
    expiresOffsetDays: number | null;
    office: {
      externalId: string;
      resourceId: string;
      label: string;
      validFromOffsetDays: number;
      validUntilOffsetDays: number;
    } | null;
    expected: string[];
  };
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
    editPolicy: 'request_only',
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
        birthDate: '1988-08-18',
        email: 'roga.employee@manual.pass.mstyle.ru',
        phone: '+79990001002',
        role: 'employee',
      },
    ],
    employeeCandidates: [],
    scenario: {
      description:
        'Основной сценарий резидента с офисом, часами и сотрудником.',
      balanceMinutes: 1200,
      employeeBalanceMinutes: 0,
      accrualOffsetDays: 0,
      expiresOffsetDays: 180,
      office: {
        externalId: 'tf-room:717',
        resourceId: 'off_manual_roga_office_101',
        label: 'Офис №101, БЦ «Добрынинский»',
        validFromOffsetDays: -30,
        validUntilOffsetDays: 180,
      },
      expected: [
        'Действующий офис и договор',
        '20 часов для бронирований',
        'Один активный сотрудник',
        'Добавление, удаление и повторное добавление сотрудника',
      ],
    },
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
    editPolicy: 'self_service',
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
    employeeCandidates: [
      {
        key: 'romashka-employee-one',
        title: 'Первый сотрудник ООО «Ромашка»',
        fullName: 'Ромашкин Роман Романович',
        lastName: 'Ромашкин',
        firstName: 'Роман',
        middleName: 'Романович',
        birthDate: '1987-07-17',
        email: 'romashka.employee.one@manual.pass.mstyle.ru',
        phone: '+79990002002',
        role: 'employee',
      },
      {
        key: 'romashka-employee-two',
        title: 'Второй сотрудник ООО «Ромашка»',
        fullName: 'Цветкова Лилия Семёновна',
        lastName: 'Цветкова',
        firstName: 'Лилия',
        middleName: 'Семёновна',
        birthDate: '1992-09-12',
        email: 'romashka.employee.two@manual.pass.mstyle.ru',
        phone: '+79990002003',
        role: 'employee',
      },
      {
        key: 'romashka-employee-three',
        title: 'Третий сотрудник ООО «Ромашка»',
        fullName: 'Лимитов Лев Львович',
        lastName: 'Лимитов',
        firstName: 'Лев',
        middleName: 'Львович',
        birthDate: '1984-02-29',
        email: 'romashka.employee.three@manual.pass.mstyle.ru',
        phone: '+79990002004',
        role: 'employee',
      },
    ],
    scenario: {
      description:
        'Самостоятельное редактирование и границы лимита сотрудников.',
      balanceMinutes: 300,
      employeeBalanceMinutes: 0,
      accrualOffsetDays: 0,
      expiresOffsetDays: 30,
      office: null,
      expected: [
        'Самостоятельное сохранение реквизитов',
        '5 часов для бронирований',
        'Успешное добавление двух сотрудников',
        'Отказ при превышении лимита в 2 сотрудника',
      ],
    },
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
    editPolicy: 'request_only',
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
    employeeCandidates: [],
    scenario: {
      description: 'Граничный сценарий с истёкшим пакетом резидентских часов.',
      balanceMinutes: 120,
      employeeBalanceMinutes: 0,
      accrualOffsetDays: -31,
      expiresOffsetDays: -1,
      office: null,
      expected: [
        'Отображается пакет 2 часа',
        'Срок действия часов истёк',
        'Оплата бронирования резидентскими часами недоступна',
      ],
    },
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
    editPolicy: 'request_only',
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
    employeeCandidates: [],
    scenario: {
      description:
        'Физическое лицо без офиса, часов и управления сотрудниками.',
      balanceMinutes: 0,
      employeeBalanceMinutes: 0,
      accrualOffsetDays: null,
      expiresOffsetDays: null,
      office: null,
      expected: [
        'Нет раздела управления компанией и сотрудниками',
        'Нет резидентских офисов',
        'Нет бесплатных часов',
      ],
    },
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
  [profile.owner, ...profile.employees, ...profile.employeeCandidates].map(
    (identity) => ({
      ...identity,
      profileKey: profile.key,
    }),
  ),
);

/**
 * Guest contacts are delivery-only fixtures: preparing resident profiles must
 * never create resident identities for them. Mstyle routes these exact phones
 * through the production guest endpoints while manual testing is enabled.
 */
export const MANUAL_TEST_GUEST_CONTACTS: readonly ManualTestGuestContactFixture[] =
  [
    {
      key: 'guest-individual',
      title: 'Гостев Иван Петрович — ручное тестирование',
      phone: '+79990005001',
      role: 'guest',
    },
    {
      key: 'guest-company',
      title: 'ООО «Тестовая Ласточка» — ручное тестирование',
      phone: '+79990005002',
      role: 'guest',
    },
    {
      key: 'guest-entrepreneur',
      title: 'ИП Испытателев Илья Ильич — ручное тестирование',
      phone: '+79990005003',
      role: 'guest',
    },
  ];

export function findManualTestIdentity(type: 'email' | 'phone', value: string) {
  const normalized = type === 'email' ? value.trim().toLowerCase() : value;
  if (type === 'email') {
    return MANUAL_TEST_IDENTITIES.find(
      (identity) => identity.email.toLowerCase() === normalized.toLowerCase(),
    );
  }
  return [...MANUAL_TEST_IDENTITIES, ...MANUAL_TEST_GUEST_CONTACTS].find(
    (identity) => identity.phone.toLowerCase() === normalized.toLowerCase(),
  );
}
