/** Tela do pacote do dia gerado por LLM. */
import { h, card, button, badge, bar, emptyNote, formatDateTime } from './dom.js';
import { latestPack, getPack, dialogueText } from '../core/packs.js';
import { seenGrammarIds, markGrammarKnown, getItem, grammarRef, explainItem } from '../core/schedule.js';
import { GRAMMAR_SYLLABUS, grammarProgress, grammarPoint } from '../core/content/grammar.js';
import { speakButton, canSpeak, playAudio } from './audio.js';
import { requestGeneration } from '../core/serverStore.js';
import { podeGerarNoAparelho, gerarNoAparelho } from './geracao.js';
import { temChaveApi } from '../core/secrets.js';
import { dayKey } from '../core/xp.js';

export function renderPack(ctx) {
  const { state } = ctx;
  if ((ctx.ui.packTab || ctx.params.tab) === 'gramatica') return renderSyllabus(ctx);
  const date = ctx.params.date || null;
  const entry = date ? getPack(state, date) : latestPack(state);
  const wrap = h('div', { class: 'stack' });

  if (!entry) {
    wrap.append(renderEmpty(ctx));
    return wrap;
  }

  const pack = entry.pack;
  const isToday = pack.date === dayKey();

  wrap.append(card(null,
    h('div', { class: 'row between' },
      h('h2', {}, `Pacote de ${pack.date}`),
      h('span', {},
        isToday ? badge('hoje', 'ok') : badge(`${pack.date}`, 'neutral'), ' ',
        badge('gerado por LLM', 'warn'))),
    h('p', {}, pack.focus.reason),
    h('div', { class: 'chips' }, ...pack.focus.tags.map((t) => h('span', { class: 'chip chip-on' }, t)),
      h('span', { class: 'chip' }, `nível ${pack.focus.level}`)),
    h('div', { class: 'actions' },
      button('Estudar os exercícios deste pacote', () => ctx.go('study', { exercise: 'pack', date: pack.date })),
      button('Criar cartões do diálogo', () => ctx.go('cards', { prefill: dialogueText(pack) }), { kind: 'secondary' }),
      button('Revisar cartões pendentes', () => ctx.go('cards', { tab: 'review' }), { kind: 'ghost' }),
      button('Currículo gramatical', () => { ctx.ui.packTab = 'gramatica'; ctx.render(); }, { kind: 'ghost' })),
    h('small', { class: 'hint' }, provenanceLine(pack)),
  ));

  if (pack.coachNotes?.length) {
    wrap.append(card('Observações do gerador',
      h('p', { class: 'hint' },
        'Leitura do modelo sobre seus erros recentes. É comentário de conteúdo, não avaliação: ' +
        'sua pontuação por habilidade continua vindo só das suas respostas nos exercícios.'),
      h('ul', { class: 'tight' }, ...pack.coachNotes.map((n) => h('li', {}, n)))));
  }

  // ---- Diálogo: chinês primeiro, apoio sob demanda ----
  const dlg = pack.dialogue;
  const dialogCard = card(`Diálogo — ${dlg.title}`);
  const supports = [];
  dialogCard.append(h('p', { class: 'hint' }, dlg.context));
  dialogCard.append(h('p', { class: 'hint' },
    canSpeak()
      ? 'Ouça antes de ler: toque no ▶ de cada fala e só então clique no texto para revelar pinyin e tradução. ' +
        'A voz é sintetizada pelo navegador, não é fala natural.'
      : 'Tente entender só pelo chinês. Clique numa fala para revelar pinyin e tradução.'));
  for (const line of dlg.lines) {
    const support = h('div', { class: 'pinyin hidden' },
      h('div', {}, line.py), h('div', { class: 'hint' }, line.pt));
    supports.push(support);
    dialogCard.append(h('div', { class: 'dialog-line' },
      h('div', { class: 'row' },
        canSpeak() ? speakButton(line.hz, { label: '▶', kind: 'ghost' }) : null,
        canSpeak() ? speakButton(line.hz, { label: '🐢', rate: 0.7, kind: 'ghost' }) : null,
        h('button', {
          class: 'dialog-hz mono-zh',
          onClick: () => support.classList.toggle('hidden'),
        }, `${line.speaker}: ${line.hz}`)),
      support));
  }
  dialogCard.append(h('div', { class: 'actions' },
    canSpeak()
      ? button('▶ Ouvir o diálogo inteiro', () => {
          // Uma fala por vez, com pausa entre elas.
          dlg.lines.forEach((l, i) => setTimeout(() => playAudio(l.hz, { rate: 0.95 }), i * 2600));
        })
      : null,
    button('Revelar tudo', () => {
      for (const el of supports) el.classList.remove('hidden');
    }, { kind: 'ghost' })));
  wrap.append(dialogCard);

  // ---- Vocabulário ----
  const vocabCard = card(`Vocabulário (${pack.vocab.length})`);
  const novos = pack.vocab.filter((v) => v.status !== 'revisao').length;
  const revisoes = pack.vocab.length - novos;
  vocabCard.append(h('p', { class: 'hint' },
    `${novos} palavra(s) nova(s) e ${revisoes} de revisão (trazidas de volta pelo agendador, ` +
    'em frases novas). Todas entraram no léxico do app: o gerador de cartões passa a reconhecê-las ' +
    'em textos que você colar. Os cartões correspondentes ficam pendentes de revisão.'));
  for (const v of pack.vocab) {
    const reveal = h('div', { class: 'pinyin hidden' },
      h('div', {}, `${v.py} — ${v.pt}`),
      v.example ? h('div', { class: 'mono-zh' }, v.example.hz) : null,
      v.example ? h('div', { class: 'hint' }, `${v.example.py} · ${v.example.pt}`) : null);
    const revisao = v.status === 'revisao';
    vocabCard.append(h('div', { class: 'draft' },
      h('div', { class: 'row between' },
        h('span', { class: 'row' },
          canSpeak() ? speakButton(v.hz, { label: '▶', kind: 'ghost' }) : null,
          h('button', { class: 'dialog-hz mono-zh', onClick: () => reveal.classList.toggle('hidden') }, v.hz)),
        h('span', {},
          revisao ? badge('revisão', 'ok') : badge('novo', 'warn'), ' ',
          badge(`nível ${v.level}`, 'neutral'))),
      reveal));
  }
  wrap.append(vocabCard);

  if (pack.fieldPhrases?.length) {
    wrap.append(card('Frases de campo',
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Chinês'), h('th', {}, 'Pinyin'), h('th', {}, 'Português'), h('th', {}, 'Quando usar'))),
        h('tbody', {}, ...pack.fieldPhrases.map((f) => h('tr', {},
          h('td', { class: 'mono-zh' },
            canSpeak() ? speakButton(f.hz, { label: '▶', kind: 'ghost' }) : null, ' ', f.hz),
          h('td', {}, f.py), h('td', {}, f.pt), h('td', { class: 'hint' }, f.when)))))));
  }

  if (pack.tonePairs?.length) {
    wrap.append(card('Pares de tom para não confundir',
      ...pack.tonePairs.map((p) => h('div', { class: 'draft' },
        h('div', { class: 'row' },
          h('strong', { class: 'mono-zh' }, p.a.hz), h('span', { class: 'hint' }, `${p.a.py} — ${p.a.pt}`),
          h('span', {}, '↔'),
          h('strong', { class: 'mono-zh' }, p.b.hz), h('span', { class: 'hint' }, `${p.b.py} — ${p.b.pt}`)),
        h('small', { class: 'hint' }, p.note)))));
  }

  if (pack.grammarNote) {
    const point = grammarPoint(pack.grammarNote.pointId);
    const progress = grammarProgress(seenGrammarIds(state));
    wrap.append(card(`Estrutura nova — ${pack.grammarNote.point}`,
      h('div', { class: 'row between' },
        point ? h('small', { class: 'hint' }, `Padrão: ${point.pattern}`) : null,
        badge(`${progress.done}/${progress.total} do currículo`, 'neutral')),
      h('p', {}, pack.grammarNote.explanation),
      ...pack.grammarNote.examples.map((e) => h('div', { class: 'draft' },
        h('div', { class: 'mono-zh' }, e.hz),
        h('div', { class: 'hint' }, `${e.py} · ${e.pt}`)))));
  }

  // ---- Histórico de pacotes ----
  const others = (state.packs || []).slice().reverse().filter((p) => p.date !== pack.date);
  wrap.append(card('Pacotes anteriores',
    others.length
      ? h('div', { class: 'chips' }, ...others.map((p) =>
          h('button', { class: 'chip', onClick: () => ctx.go('pack', { date: p.date }) }, p.date)))
      : emptyNote('Nenhum outro pacote guardado ainda.'),
    h('div', { class: 'actions' }, renderGenerateButton(ctx, { force: true }))));

  return wrap;
}

function provenanceLine(pack) {
  const p = pack.provenance || {};
  const parts = [
    `gerado em ${formatDateTime(p.generatedAt)}`,
    p.backend ? `via ${p.backend}` : null,
    p.model ? `modelo ${p.model}` : null,
    p.promptVersion ? `prompt ${p.promptVersion}` : null,
    p.attempts ? `${p.attempts} tentativa(s) de validação` : null,
    p.costUsd != null ? `custo ~US$ ${Number(p.costUsd).toFixed(3)}` : null,
  ].filter(Boolean);
  return `Procedência: ${parts.join(' · ')}. Briefing: ${p.briefingSummary || '—'}.`;
}

function renderEmpty(ctx) {
  const local = ctx.store.mode !== 'server';
  const podeAqui = podeGerarNoAparelho(ctx);
  return card('Nenhum pacote carregado',
    h('p', {}, 'O pacote do dia é gerado por um modelo de linguagem a partir dos seus erros ' +
      'recentes, das suas lacunas de conversa e dos temas em que você vai mal.'),
    h('p', { class: 'hint' },
      'O que é enviado ao modelo: nível estimado, habilidades, itens que você errou, temas fracos, ' +
      'o texto do campo "o que não consegui dizer" das conversas e a lista de palavras já conhecidas. ' +
      'Nome e histórico completo não são enviados. Cada briefing fica salvo em data/outbox/ para você conferir.'),
    local && !podeAqui
      ? h('div', { class: 'callout' },
          h('strong', {}, 'Sem servidor e sem chave neste aparelho. '),
          'Há dois caminhos: rodar ', h('code', {}, 'npm start'),
          ' no computador, ou guardar uma chave da Claude API neste aparelho para ele gerar sozinho ',
          '(Configurações → Gerar neste aparelho).')
      : h('div', { class: 'actions' },
          renderGenerateButton(ctx, { force: false }),
          !local
            ? button('Gerar pacote de exemplo (sem modelo)', () => runGeneration(ctx, { backend: 'mock', force: true }), { kind: 'ghost' })
            : null),
    h('p', { class: 'hint' },
      'Para gerar todo dia automaticamente, instale o temporizador: ',
      h('code', {}, 'bash scripts/instalar-timer.sh'),
      '. Ele roda o gerador às 5h e deixa o pacote pronto antes de você abrir o app.'));
}

function renderGenerateButton(ctx, { force }) {
  // No celular (sem servidor) a geração acontece aqui mesmo, com a chave do aparelho.
  if (ctx.store.mode !== 'server') {
    if (!temChaveApi()) {
      return button('Configurar a chave para gerar aqui', () => ctx.go('settings'), { kind: 'secondary' });
    }
    return button(force ? 'Gerar de novo neste aparelho' : 'Gerar o pacote de hoje aqui',
      () => gerarNoAparelho(ctx, { force }), { kind: force ? 'ghost' : 'primary' });
  }
  return button(force ? 'Gerar pacote de hoje de novo' : 'Gerar pacote de hoje agora',
    () => runGeneration(ctx, { force }), { kind: force ? 'ghost' : 'primary' });
}

async function runGeneration(ctx, { backend = null, force = false } = {}) {
  const cfg = ctx.state.settings.llm || {};
  ctx.toast('Gerando o pacote… isso leva alguns minutos. Pode continuar usando o app.', 'info');
  const res = await requestGeneration({
    backend: backend || cfg.backend || null,
    model: cfg.model || null,
    sendGaps: cfg.sendGaps !== false,
    force,
  });
  if (!res.ok) {
    ctx.toast(`Geração falhou: ${res.error || 'veja o log no terminal'}`, 'error');
    console.warn(res.log);
    return;
  }
  ctx.toast('Pacote gerado. Recarregando…', 'success');
  location.reload();
}


/**
 * Currículo gramatical: mostra a fila, o que já foi apresentado e permite
 * marcar o que você já domina — assim a fila não gasta dias com estrutura
 * que você já usa, mas o item ainda entra na revisão espaçada.
 */
function renderSyllabus(ctx) {
  const { state } = ctx;
  const seen = new Set(seenGrammarIds(state));
  const progress = grammarProgress([...seen]);
  const marked = new Set();
  const wrap = h('div', { class: 'stack' });

  wrap.append(card('Currículo gramatical',
    h('p', { class: 'hint' },
      'A fila define qual estrutura o gerador ensina a cada dia — uma por dia, em ordem. ' +
      'Marque o que você já domina para o gerador não gastar os próximos dias nisso; ' +
      'o item entra na revisão espaçada com intervalo de 7 dias em vez de 1.'),
    bar(progress.percent, `${progress.done} de ${progress.total} apresentadas`),
    h('div', { class: 'actions' },
      button('Voltar ao pacote', () => { ctx.ui.packTab = null; ctx.render(); }, { kind: 'ghost' }))));

  const list = card(null);
  for (const point of GRAMMAR_SYLLABUS) {
    const item = getItem(state, grammarRef(point.id));
    const done = seen.has(point.id);
    list.append(h('div', { class: 'draft' },
      h('div', { class: 'row between' },
        h('span', {},
          done
            ? '✓ '
            : h('input', {
                type: 'checkbox',
                onChange: (e) => (e.target.checked ? marked.add(point.id) : marked.delete(point.id)),
              }),
          ' ', h('strong', {}, point.name),
          h('span', { class: 'hint' }, ` — ${point.pattern}`)),
        badge(`nível ${point.level}`, 'neutral')),
      h('small', { class: 'hint' }, point.hint),
      item ? h('small', { class: 'hint' }, explainItem(item)) : null));
  }
  list.append(h('div', { class: 'actions' },
    button('Marcar selecionadas como já dominadas', () => {
      if (!marked.size) {
        ctx.toast('Selecione ao menos uma estrutura.', 'error');
        return;
      }
      const count = marked.size;
      ctx.commit((s) => markGrammarKnown(s, [...marked], {
        labelFor: (id) => grammarPoint(id)?.name || id,
      }));
      ctx.toast(`${count} estrutura(s) marcada(s). A fila pula para a próxima não dominada.`, 'success');
    })));
  wrap.append(list);
  return wrap;
}
