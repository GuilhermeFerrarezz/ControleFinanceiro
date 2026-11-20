import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HELP_TOPICS, filterHelpTopics } from '../src/lib/help-content';
import { tutorialSteps } from '../src/lib/tutorial';

test('ajuda cobre as áreas do passeio e encontra estoque e recuperação sem acentos', () => {
  for (const step of tutorialSteps(true).filter(step => step.href && step.href !== '/dashboard/help')) {
    assert.ok(HELP_TOPICS.some(topic => topic.href === step.href), step.href);
  }
  assert.ok(filterHelpTopics('contagem fisica').some(topic => topic.id === 'stock-movements'));
  assert.ok(filterHelpTopics('senha recuperar').some(topic => topic.id === 'recover-password'));
  assert.ok(filterHelpTopics('confirmar email').length > 0);
  assert.ok(HELP_TOPICS.filter(topic => topic.group === 'platform').every(topic => topic.platformOnly));
});

test('passeio de funcionário explica o acesso de consulta ao faturamento', () => {
  const employee = tutorialSteps(false).find(step => step.href === '/dashboard/revenue')!;
  assert.match(employee.text, /Consulte/);
  assert.match(employee.text, /O dono/);
  assert.notEqual(employee.text, tutorialSteps(true).find(step => step.href === employee.href)!.text);
});
