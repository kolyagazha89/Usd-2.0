import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePushTemplateResponse} from '../src/admin/push-template-response.ts';

const valid = () => ({
  revision: 'a'.repeat(64),
  templates: [{
    key: 'profileLinkRequest',
    label: 'Заявка на привязку',
    description: 'Уведомление администратору',
    enabled: true,
    title: 'Новая заявка',
    body: 'Откройте панель',
  }],
});

test('valid server response produces independent editable PUSH templates', () => {
  const input = valid();
  const output = parsePushTemplateResponse(input);
  assert.deepEqual(output, input);
  assert.notStrictEqual(output.templates[0], input.templates[0]);
});

test('a missing, null or malformed template response is rejected without render state', () => {
  for (const value of [undefined, null, [], {}, {revision: 'a'.repeat(64)}, {revision: 'bad',templates:[]},
    {revision: 'a'.repeat(64),templates:[null]},
    {revision: 'a'.repeat(64),templates:[{...valid().templates[0],enabled:'yes'}]},
  ]) {
    assert.throws(() => parsePushTemplateResponse(value), /шаблон|ответ|PUSH/i);
  }
});

test('duplicate template identities are rejected', () => {
  const input = valid();
  input.templates.push({...input.templates[0]});
  assert.throws(() => parsePushTemplateResponse(input), /PUSH/i);
});
