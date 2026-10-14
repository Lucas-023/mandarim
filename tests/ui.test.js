import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom, byClass, byTag, byText, byButton, byButtonLike } from './helpers/dom-shim.js';

installDom();

const { emptyState, Store, memoryBackend } = await import('../src/core/storage.js');
const { renderOnboarding } = await import('../src/ui/onboarding.js');
const { renderPlacement } = await import('../src/ui/placement.js');
const { renderDashboard } = await import('../src/ui/dashboard.js');
const { renderStudy } = await import('../src/ui/study.js');
const { renderCards } = await import('../src/ui/cards.js');
const { renderActivities } = await import('../src/ui/activities.js');
const { renderHistory } = await import('../src/ui/history.js');
const { renderSettings } = await import('../src/ui/settings.js');
const { renderPack } = await import('../src/ui/pack.js');
const { ingestPack } = await import('../src/core/packs.js');
const { resetRegistry } = await import('../src/core/content/lexicon.js');
const REAL_PACK = JSON.parse(
  await (await import('node:fs/promises')).readFile(new URL('./fixtures/pack-real.json', import.meta.url), 'utf8'),
);
const { startPlacement, nextQuestion, submitAnswer, finishPlacement } = await import('../src/core/placement.js');
const { buildInitialPlan } = await import('../src/core/plan.js');
const { evaluateAchievements } = await import('../src/core/achievements.js');

/** Contexto de UI equivalente ao de app.js, sem roteador. */
function makeCtx(state = emptyState(), params = {}) {
  const store = new Store(memoryBackend());
  store.state = state;
  const ctx = {
    state, store, params, ui: {}, toasts: [], navigations: [], renders: 0,
    toast: (m, k) => ctx.toasts.push({ m, k }),
    go: (view, p = {}) => ctx.navigations.push({ view, params: p }),
    render: () => (ctx.renders += 1),
    commit: (fn) => {
      const r = fn(state);
      evaluateAchievements(state);
      store.save();
      return r;
    },
  };
  return ctx;
}

function completePlacement(state) {
  startPlacement(state, { minutesPerDay: '15 a 20 minutos', mainGoal: 'Futebol e convivência' });
  let q;
  while ((q = nextQuestion(state.placementInProgress))) {
    const answer = q.type === 'self_report' ? ['你好'] : q.type === 'open' ? '我叫 Lucas，我是巴西人，每周踢足球两次，请说慢一点。' : q.answer;
    submitAnswer(state, { questionId: q.id, answer });
  }
  const { result, attempt } = finishPlacement(state);
  state.plan = buildInitialPlan(result, { questionnaire: attempt.questionnaire, minutesPerDay: 20 });
  return result;
}

test('onboarding exige as perguntas obrigatórias antes de seguir', () => {
  const ctx = makeCtx();
  const view = renderOnboarding(ctx);
  assert.match(view.textContent, /Questionário inicial/);
  assert.match(view.textContent, /não tem áudio nem reconhecimento de fala/);
  view.find(byButton('Salvar e fazer o nivelamento')).click();
  assert.equal(ctx.state.profile.onboardingDone, false);
  assert.equal(ctx.toasts.at(-1).k, 'error');
});

test('onboarding salva perfil, meta diária e navega para o nivelamento', () => {
  const ctx = makeCtx();
  const view = renderOnboarding(ctx);
  for (const sel of view.findAll(byTag('select'))) sel.type(sel.findAll(byTag('option'))[1].value);
  view.find(byButton('Salvar e fazer o nivelamento')).click();
  assert.equal(ctx.state.profile.onboardingDone, true);
  assert.ok(ctx.state.settings.dailyGoalXp > 0);
  assert.deepEqual(ctx.navigations.at(-1), { view: 'placement', params: {} });
});

test('objetivos podem ser reordenados no onboarding', () => {
  const ctx = makeCtx();
  const view = renderOnboarding(ctx);
  const second = view.findAll(byClass('goal-list'))[0].childNodes[1];
  second.find(byButton('↑')).click();
  for (const sel of view.findAll(byTag('select'))) sel.type(sel.findAll(byTag('option'))[1].value);
  view.find(byButton('Salvar e fazer o nivelamento')).click();
  assert.equal(ctx.state.profile.goals[0].id, 'conversar_simples');
});

test('nivelamento: intro declara etapas e limitações', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const ctx = makeCtx(state);
  const view = renderPlacement(ctx);
  assert.match(view.textContent, /Etapa B/);
  assert.match(view.textContent, /Etapa D/);
  assert.match(view.textContent, /NÃO AVALIADA/);
  view.find(byButton('Começar o nivelamento')).click();
  assert.ok(state.placementInProgress);
});

test('nivelamento: a questão não revela a resposta antes de responder', () => {
  const state = emptyState();
  startPlacement(state, {});
  const ctx = makeCtx(state);
  // primeira questão é a autoavaliação; responde para chegar a uma de múltipla escolha
  const sr = renderPlacement(ctx);
  sr.find(byButton('Não conheço nenhuma')).click();
  ctx.ui.placementFeedback = null;
  const view = renderPlacement(ctx);
  const options = view.findAll(byClass('option'));
  assert.equal(options.length, 4);
  assert.ok(!view.textContent.includes('Resposta esperada'));
  options[0].click();
  assert.ok(ctx.ui.placementFeedback);
});

test('nivelamento: revelar pinyin registra apoio usado', () => {
  const state = emptyState();
  startPlacement(state, {});
  const ctx = makeCtx(state);
  renderPlacement(ctx).find(byButton('Não conheço nenhuma')).click();
  ctx.ui.placementFeedback = null;
  const view = renderPlacement(ctx);
  const reveal = view.find(byButtonLike('Mostrar pinyin'));
  if (reveal) {
    reveal.click();
    view.findAll(byClass('option'))[0].click();
    assert.equal(state.placementInProgress.responses.at(-1).supportUsed, true);
  }
});

test('relatório do nivelamento mostra habilidades, limitações e plano', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  completePlacement(state);
  const ctx = makeCtx(state, { report: 'latest' });
  const view = renderPlacement(ctx);
  assert.match(view.textContent, /Resultado do nivelamento/);
  assert.match(view.textContent, /听力/);
  assert.match(view.textContent, /não avaliada/);
  assert.match(view.textContent, /não é certificação oficial do HSK/);
  assert.match(view.textContent, /Plano recomendado/);
  assert.match(view.textContent, /Por quê:/);
});

test('painel não inventa nível nem habilidades antes do nivelamento', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const view = renderDashboard(makeCtx(state));
  assert.match(view.textContent, /Nível ainda não estimado/);
  assert.match(view.textContent, /não avaliada/);
  assert.match(view.textContent, /Revisões no Anki hoje/);
  assert.match(view.textContent, /não configurado/);
  assert.match(view.textContent, /Nada é estimado se a leitura falhar/);
});

test('painel mostra XP, meta e recomendação explicada depois do nivelamento', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  completePlacement(state);
  const view = renderDashboard(makeCtx(state));
  assert.match(view.textContent, /XP total/);
  assert.match(view.textContent, /Meta de hoje/);
  assert.match(view.textContent, /O que estudar agora/);
  assert.match(view.textContent, /Por quê:/);
});

test('sem vozes em chinês, a tela de estudo diz isso em vez de simular escuta', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  completePlacement(state);
  const ctx = makeCtx(state);
  const view = renderStudy(ctx);
  assert.match(view.textContent, /não expõe vozes em chinês/);
  assert.match(view.textContent, /não avaliada/);
  view.find(byButtonLike('Reconhecimento de vocabulário')).click();
  assert.ok(state.activeSession, 'o exercício deveria virar sessão persistida');
  assert.equal(state.activeSession.exercise.items.length, 6);
});

test('exercício completo grava evidência, XP e mostra o resultado', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const ctx = makeCtx(state);
  renderStudy(ctx).find(byButtonLike('Reconhecimento de vocabulário')).click();

  for (let i = 0; i < 6; i += 1) {
    const view = renderStudy(ctx);
    const sess = state.activeSession;
    const item = sess.exercise.items[sess.index];
    view.findAll(byClass('option'))[item.answer].click();
    renderStudy(ctx).find(byButtonLike('Continuar')).click();
  }
  assert.equal(state.activeSession, null, 'a sessão é encerrada ao concluir');
  const result = renderStudy(ctx);
  assert.match(result.textContent, /6 de 6 corretos/);
  assert.equal(state.skillEvidence.length, 6);
  assert.equal(state.exerciseResults.length, 1);
  assert.ok(state.xpEvents.some((e) => e.key.startsWith('exercise:')));
});

test('fechar o app no meio do exercício não perde as respostas', () => {
  const state = emptyState();
  const ctx = makeCtx(state);
  renderStudy(ctx).find(byButtonLike('Reconhecimento de vocabulário')).click();

  // responde 2 de 6 e "fecha o navegador"
  for (let i = 0; i < 2; i += 1) {
    const view = renderStudy(ctx);
    const sess = state.activeSession;
    const item = sess.exercise.items[sess.index];
    view.findAll(byClass('option'))[item.answer].click();
    renderStudy(ctx).find(byButtonLike('Continuar')).click();
  }
  const salvo = JSON.parse(JSON.stringify(state)); // o que foi para o disco
  assert.equal(Object.keys(salvo.activeSession.answers).length, 2);
  assert.equal(salvo.skillEvidence.length, 0, 'sessão aberta não registra desempenho');

  // app reaberto a partir do estado salvo
  const ctx2 = makeCtx(salvo);
  const retomado = renderStudy(ctx2);
  assert.match(retomado.textContent, /3\/6/, 'retoma no item seguinte');
  assert.match(retomado.textContent, /salvo automaticamente/);
  assert.equal(Object.keys(salvo.activeSession.answers).length, 2, 'as respostas continuam lá');
});

test('a sessão pode ser descartada sem registrar desempenho', () => {
  const state = emptyState();
  const ctx = makeCtx(state);
  renderStudy(ctx).find(byButtonLike('Reconhecimento de vocabulário')).click();
  const view = renderStudy(ctx);
  const item = state.activeSession.exercise.items[0];
  view.findAll(byClass('option'))[item.answer].click();
  renderStudy(ctx).find(byButton('Descartar sessão')).click();
  assert.equal(state.activeSession, null);
  assert.equal(state.skillEvidence.length, 0);
  assert.equal(state.exerciseResults.length, 0);
});

test('o teclado responde o item e avança', () => {
  const state = emptyState();
  const ctx = makeCtx(state);
  renderStudy(ctx).find(byButtonLike('Reconhecimento de vocabulário')).click();
  const view = renderStudy(ctx);
  assert.match(view.textContent, /1–4 responde/);
  const item = state.activeSession.exercise.items[0];
  let impedido = false;
  ctx.ui.keyHandler({ key: String(item.answer + 1), preventDefault: () => { impedido = true; } });
  assert.equal(impedido, true);
  assert.equal(state.activeSession.answers[item.id], item.answer);
  assert.ok(state.activeSession.feedback.correct);
});

test('gerador de cartões: gera, salva como pendente e exige verso para aprovar', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const ctx = makeCtx(state);
  const view = renderCards(ctx);
  view.find(byTag('textarea')).type('A: 你周末有什么计划？\nB: 我想和朋友一起踢足球。');
  view.find(byButton('Gerar sugestões')).click();

  const generated = renderCards(ctx);
  assert.match(generated.textContent, /Sugestões/);
  assert.match(generated.textContent, /GLOSA/);
  generated.find(byButton('Salvar selecionados para revisão')).click();
  assert.ok(state.cardDrafts.length > 0);
  assert.ok(state.cardDrafts.every((d) => d.status === 'pending'));
  assert.equal(ctx.ui.cardsTab, 'review');

  const review = renderCards(ctx);
  assert.match(review.textContent, /Revisar sugestões/);
  assert.match(review.textContent, /Nada vai para o Anki sem aprovação/);
});

test('aprovar sem verso é bloqueado', () => {
  const state = emptyState();
  state.cardDrafts.push({
    id: 'c1', status: 'pending', front: '你周末有什么计划？', back: '', pinyin: 'nǐ zhōumò yǒu shénme jìhuà',
    example: '', exampleTranslation: '', context: 'frase', difficulty: 2, tags: ['conversa'],
    template: 'zh_pt', kind: 'sentence', source: 'teste', createdAt: new Date().toISOString(),
    needsReview: true, reviewNotes: ['Tradução é apenas uma glosa.'], confidence: { pinyin: 'alta', translation: 'baixa' },
  });
  const ctx = makeCtx(state);
  ctx.ui.cardsTab = 'review';
  const review = renderCards(ctx);
  assert.match(review.textContent, /glosa/);
  review.find(byButton('Aprovar')).click();
  assert.equal(ctx.toasts.at(-1).k, 'error');
  assert.equal(state.cardDrafts[0].status, 'pending');
});

test('aprovar cartão editado o deixa pronto para exportar', () => {
  const state = emptyState();
  state.cardDrafts.push({
    id: 'c1', status: 'pending', front: '踢足球', back: 'jogar futebol', pinyin: 'tī zúqiú',
    example: '', exampleTranslation: '', context: 'futebol', difficulty: 1, tags: ['futebol'],
    template: 'zh_pt', kind: 'word', source: 'teste', createdAt: new Date().toISOString(), reviewNotes: [],
    confidence: { pinyin: 'alta', translation: 'alta' },
  });
  const ctx = makeCtx(state);
  ctx.ui.cardsTab = 'review';
  renderCards(ctx).find(byButton('Aprovar')).click();
  assert.equal(state.cardDrafts[0].status, 'approved');

  ctx.ui.cardsTab = 'export';
  const exportView = renderCards(ctx);
  assert.match(exportView.textContent, /Exportar 1 cartão/);
  assert.match(exportView.textContent, /Baixar TSV/);
  assert.match(exportView.textContent, /AnkiConnect/);
  assert.match(exportView.textContent, /Como importar no Anki/);
});

test('registro de conversa concede XP e cria sugestões a partir das expressões', () => {
  const state = emptyState();
  const ctx = makeCtx(state, { tab: 'conversation' });
  const view = renderActivities(ctx);
  const areas = view.findAll(byTag('textarea'));
  areas[0].type('加油\n好球\n传给我');
  view.findAll(byTag('input')).find((i) => i.getAttribute('type') === 'number').type('15');
  view.find(byButton('Registrar conversa')).click();
  assert.equal(state.conversations.length, 1);
  assert.ok(state.xpEvents.some((e) => e.type === 'real_conversation'));
  assert.ok(state.cardDrafts.some((d) => d.front === '加油'));
  assert.equal(state.skillEvidence.length, 0, 'conversa não gera evidência de proficiência');
});

test('histórico declara origem dos dados e avisa quando há pouca evidência', () => {
  const state = emptyState();
  completePlacement(state);
  const view = renderHistory(makeCtx(state));
  assert.match(view.textContent, /XP por dia/);
  assert.match(view.textContent, /Origem dos dados/);
  assert.match(view.textContent, /Só há uma medição/);
  assert.match(view.textContent, /sem dado/);
});

test('configurações salvam metas e permitem apagar tudo', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const ctx = makeCtx(state);
  const view = renderSettings(ctx);
  const numbers = view.findAll(byTag('input')).filter((i) => i.getAttribute('type') === 'number');
  numbers[0].type('45');
  numbers[1].type('120');
  view.find(byButton('Salvar')).click();
  assert.equal(state.profile.minutesPerDay, 45);
  assert.equal(state.settings.dailyGoalXp, 120);

  renderSettings(ctx).find(byButton('Apagar tudo')).click();
  assert.equal(ctx.store.state.xpEvents.length, 0);
  assert.equal(ctx.store.state.profile.onboardingDone, false);
});

test('configurações expõem as regras de XP e a nota de privacidade', () => {
  const state = emptyState();
  const view = renderSettings(makeCtx(state));
  assert.match(view.textContent, /Regras de XP/);
  assert.match(view.textContent, /XP mede atividade e consistência/);
  assert.match(view.textContent, /localStorage deste navegador/);
  assert.match(view.textContent, /Nenhum texto que você cola é enviado/);
});

test('dados de demonstração preenchem o painel e ficam marcados como fictícios', async () => {
  const { buildDemoState } = await import('../src/core/demoData.js');
  const state = buildDemoState();
  assert.equal(state.demo, true);
  assert.equal(state.placementAttempts.length, 1);
  assert.ok(state.exerciseResults.length >= 4);
  assert.ok(state.conversations.length >= 2);
  assert.ok(state.cardDrafts.some((d) => d.status === 'approved'));
  assert.ok(state.achievements.length >= 2);

  const view = renderDashboard(makeCtx(state));
  assert.match(view.textContent, /Demo \(fictício\)/);
  assert.match(view.textContent, /Nível estimado/);
  // Mesmo com dados, escuta e fala continuam não avaliadas.
  assert.match(view.textContent, /听力/);
  assert.match(view.textContent, /não avaliada/);
});


test('a tela do pacote mostra foco, procedência e esconde o apoio até ser pedido', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  state.profile.onboardingDone = true;
  ingestPack(state, JSON.parse(JSON.stringify(REAL_PACK)));
  const ctx = makeCtx(state);
  const view = renderPack(ctx);

  assert.ok(view.textContent.includes(`Pacote de ${REAL_PACK.date}`));
  assert.match(view.textContent, /gerado por LLM/);
  assert.match(view.textContent, /Procedência:/);
  assert.ok(view.textContent.includes(`prompt ${REAL_PACK.provenance.promptVersion}`));
  assert.match(view.textContent, /Observações do gerador/);
  assert.match(view.textContent, /não avaliação|não é avaliação|não avalia|comentário de conteúdo/i);

  // O pinyin/tradução das falas começa escondido.
  const hidden = view.findAll((el) => el.classList.contains('pinyin') && el.classList.contains('hidden'));
  assert.ok(hidden.length >= REAL_PACK.dialogue.lines.length);
  view.find(byButton('Revelar tudo')).click();
  const stillHidden = view.findAll((el) => el.classList.contains('pinyin') && el.classList.contains('hidden'));
  assert.ok(stillHidden.length < hidden.length);
});

test('a tela do pacote explica o que é enviado ao modelo quando não há pacote', () => {
  const state = emptyState();
  state.profile.onboardingDone = true;
  const ctx = makeCtx(state);
  const view = renderPack(ctx);
  assert.match(view.textContent, /O que é enviado ao modelo/);
  assert.match(view.textContent, /Nome e histórico completo não são enviados/);
  assert.match(view.textContent, /data\/outbox/);
  // Sem servidor e sem chave, a tela mostra os dois caminhos possíveis.
  assert.match(view.textContent, /Sem servidor e sem chave neste aparelho/);
  assert.match(view.textContent, /npm start/);
  assert.match(view.textContent, /Claude API neste aparelho/);
});

test('painel anuncia o pacote do dia e leva aos exercícios dele', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  state.profile.onboardingDone = true;
  completePlacement(state);
  ingestPack(state, JSON.parse(JSON.stringify(REAL_PACK)));
  const ctx = makeCtx(state);
  const view = renderDashboard(ctx);
  assert.match(view.textContent, /Pacote do dia/);
  view.find(byButtonLike('Ir direto aos exercícios')).click();
  assert.deepEqual(ctx.navigations.at(-1).view, 'study');
  assert.equal(ctx.navigations.at(-1).params.exercise, 'pack');
});

test('exercícios do pacote rodam na tela de estudo e geram evidência', (t) => {
  t.after(resetRegistry);
  const state = emptyState();
  state.profile.onboardingDone = true;
  ingestPack(state, JSON.parse(JSON.stringify(REAL_PACK)));
  const ctx = makeCtx(state, { exercise: 'pack', date: REAL_PACK.date });
  renderStudy(ctx);
  assert.ok(state.activeSession, 'o exercício do pacote deveria iniciar automaticamente');
  const total = state.activeSession.exercise.items.length;

  for (let i = 0; i < total; i += 1) {
    const view = renderStudy(ctx);
    const sess = state.activeSession;
    const item = sess.exercise.items[sess.index];
    if (item.type === 'open' || item.type === 'dictation') {
      view.find(byTag('textarea')).value = '我一个星期踢两次足球。';
      view.find(byButtonLike('Enviar')).click();
    } else {
      view.findAll(byClass('option'))[item.answer].click();
    }
    renderStudy(ctx).find(byButtonLike('Continuar')).click();
  }
  assert.equal(state.activeSession, null);
  assert.equal(state.skillEvidence.length, total);
  assert.match(renderStudy(ctx).textContent, new RegExp(`de ${total} corretos`));
});

test('configurações expõem backend, custo e o que é enviado na geração', () => {
  const view = renderSettings(makeCtx(emptyState()));
  assert.match(view.textContent, /Geração automática de conteúdo/);
  assert.match(view.textContent, /Claude Code headless/);
  assert.match(view.textContent, /O que sai da sua máquina/);
  assert.match(view.textContent, /instalar-timer/);
  assert.match(view.textContent, /US\$ 0,40 a 0,90/);
});

test('no aparelho, configurações oferecem receber pacotes do computador e dizem o que vai ao GitHub', () => {
  const ctx = makeCtx(emptyState());
  ctx.store.mode = 'device';
  const texto = renderSettings(ctx).textContent;
  assert.match(texto, /Receber pacotes do computador/);
  assert.match(texto, /repositório PRIVADO/);
  assert.match(texto, /Histórico completo, cartões e gravações não saem/);
  ctx.store.mode = 'server';
  assert.doesNotMatch(renderSettings(ctx).textContent, /Receber pacotes do computador/);
});

test('caixa postal: token colado no campo do repositório é explicado, não chamado de "inválido"', async () => {
  const ctx = makeCtx(emptyState());
  ctx.store.mode = 'device';
  const view = renderSettings(ctx);
  const campos = view.findAll((el) => byTag('input')(el) && el.getAttribute('placeholder') === 'dono/mandarim-dados');
  assert.equal(campos.length, 1);
  campos[0].value = 'github_pat_11ABCDEFG';
  await view.find(byButton('Guardar e testar')).click();
  assert.match(ctx.toasts.at(-1).m, /foi colado no campo do REPOSITÓRIO/);
  assert.doesNotMatch(ctx.toasts.at(-1).m, /github_pat_11ABCDEFG/);

  campos[0].value = '';
  await view.find(byButton('Guardar e testar')).click();
  assert.match(ctx.toasts.at(-1).m, /está vazio/);
});
