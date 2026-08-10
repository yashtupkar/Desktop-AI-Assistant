import test from 'node:test';
import assert from 'node:assert/strict';
import { extractActionPlan } from '../src/automation/commandExecutor.mjs';

test('extractActionPlan preserves task order and captures all supported tags', () => {
  const response = `
    <OPEN_URL>https://www.google.com</OPEN_URL>
    <DESKTOP_TASK>Open the settings app</DESKTOP_TASK>
    <PYTHON_BROWSER_TASK>Search YouTube for cats</PYTHON_BROWSER_TASK>
  `;

  const plan = extractActionPlan(response);

  assert.equal(plan.length, 3);
  assert.deepEqual(plan.map((task) => task.type), ['OPEN_URL', 'DESKTOP', 'PYTHON_BROWSER']);
  assert.equal(plan[0].value, 'https://www.google.com');
  assert.equal(plan[2].value, 'Search YouTube for cats');
});

test('extractActionPlan returns an empty plan for plain text', () => {
  const plan = extractActionPlan('Just answer the user normally.');
  assert.deepEqual(plan, []);
});
