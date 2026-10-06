import { crmOfficeReference, crmReplyText } from './bitrix24.rules';

describe('Service replies explicitly addressed to Pass', () => {
  it.each([
    ['(ответ) Мастер уже идёт', 'Мастер уже идёт'],
    ['\n (ОТВЕТ)\nГотово', 'Готово'],
    [
      '<p>&nbsp;<b>(ответ)</b> Проверили<br>Работает</p>',
      'Проверили\nРаботает',
    ],
    ['[b]( ответ )[/b] Проверили', 'Проверили'],
    ['(ответ)', ''],
    ['Заметка сотруднику', null],
    ['[Внутреннее] (ответ) Не передавать', null],
    ['В тексте упомянута метка (ответ)', null],
    ['(ответить) Не передавать', null],
    ['', null],
  ])('applies the reply marker to %p', (comment, expected) => {
    expect(crmReplyText(comment)).toBe(expected);
  });
});

describe('CRM office references', () => {
  it.each([
    ['6', 18, 'БЦ Добрынинский-2', 'Д-2/6-18 м²'],
    ['6', 18.5, 'БЦ «Добрынинский — 2»', 'Д-2/6-18,5 м²'],
    ['6', '18,25', 'Бизнес-центр Добрининский-2', 'Д-2/6-18,25 м²'],
    ['102', 20, 'Добрынинский', 'Д/102-20 м²'],
    ['2-12', 18, 'Красная Роза', 'КР/2-12-18 м²'],
    ['6', undefined, 'Добрынинский-2', 'Д-2/6'],
    ['6', 0, 'Добрынинский-2', 'Д-2/6'],
    ['6', -1, 'Добрынинский-2', 'Д-2/6'],
    ['6', NaN, 'Добрынинский-2', 'Д-2/6'],
    ['6', Infinity, 'Добрынинский-2', 'Д-2/6'],
    ['6', 18, undefined, 'Офис 6-18 м²'],
    ['6', undefined, undefined, 'Офис 6'],
    ['', 18, 'Добрынинский-2', ''],
  ])(
    'formats office %p with area %p in %p',
    (office, area, center, expected) => {
      expect(crmOfficeReference(office, area, center)).toBe(expected);
    },
  );
});
