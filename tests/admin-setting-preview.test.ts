import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingValuePreview } from '../components/admin/setting-value-preview';
void test('compound setting previews expose the actual contact, URL, exclusion and rider values', () => {
  const cases = [
    {
      value: {
        contactPhone: '9812345678',
        returnAddress: 'Fictional return address',
      },
      texts: [
        'Contact phone',
        '9812345678',
        'Return address',
        'Fictional return address',
      ],
    },
    {
      value: { instagram: 'https://instagram.com/fictional_store' },
      texts: ['Instagram', 'https://instagram.com/fictional_store'],
    },
    {
      value: {
        excludedEmailDomains: ['example.test'],
        excludedPathPrefixes: ['/test'],
      },
      texts: [
        'Excluded email domains',
        'example.test',
        'Excluded path prefixes',
        '/test',
      ],
    },
    {
      value: {
        completedTripPaisa: 25000,
        holidayDates: ['2027-01-01'],
        operatingWeekdays: ['monday'],
      },
      texts: [
        'Completed trip',
        'NPR 250.00',
        'Non-operating dates',
        '2027-01-01',
        'Operating weekdays',
        'monday',
      ],
    },
  ];
  for (const item of cases) {
    const html = renderToStaticMarkup(
      createElement(SettingValuePreview, {
        value: item.value,
        summary: 'Summary',
      }),
    );
    for (const text of item.texts) assert.ok(html.includes(text), text);
  }
});
void test('setting preview escapes text and retains scalar summaries', () => {
  assert.equal(
    renderToStaticMarkup(
      createElement(SettingValuePreview, { value: 1000, summary: '10%' }),
    ),
    '<p class="text-sm break-words">10%</p>',
  );
  const html = renderToStaticMarkup(
    createElement(SettingValuePreview, {
      value: { returnAddress: '<script>unsafe</script>' },
      summary: '',
    }),
  );
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
});
