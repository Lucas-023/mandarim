/** Gerador, revisão e exportação de flashcards. */
import { h, card, button, badge, field, select, emptyNote, downloadText, formatDateTime } from './dom.js';
import { generateDrafts, saveDrafts, setDraftStatus, editDraft, removeDraft, CARD_TEMPLATES } from '../core/flashcards.js';
import { toTsv, toCsv, exportFilename, recordExport, EXPORT_FIELDS } from '../core/ankiExport.js';
import { checkConnection, modelFields, addCards } from '../core/ankiConnect.js';
import { recordWidget, canRecord } from './recorder.js';
import { urlDaMidia, midiaEmBase64, removerMidia } from '../core/mediaStore.js';
import { speakButton, canSpeak } from './audio.js';

const TABS = [
  ['generate', 'Gerar'],
  ['review', 'Revisar'],
  ['export', 'Exportar'],
];

export function renderCards(ctx) {
  const tab = ctx.ui.cardsTab || ctx.params.tab || 'generate';
  ctx.ui.cardsTab = tab;
  const wrap = h('div', { class: 'stack' });

  wrap.append(h('div', { class: 'tabs' }, ...TABS.map(([key, label]) => {
    const pending = key === 'review' ? ctx.state.cardDrafts.filter((d) => d.status === 'pending').length : 0;
    const approved = key === 'export' ? ctx.state.cardDrafts.filter((d) => d.status === 'approved').length : 0;
    const count = pending || approved;
    return h('button', {
      class: `tab${tab === key ? ' active' : ''}`,
      onClick: () => {
        ctx.ui.cardsTab = key;
        ctx.render();
      },
    }, count ? `${label} (${count})` : label);
  })));

  if (tab === 'generate') wrap.append(renderGenerate(ctx));
  else if (tab === 'review') wrap.append(renderReview(ctx));
  else wrap.append(renderExport(ctx));
  return wrap;
}

function renderGenerate(ctx) {
  const { state } = ctx;
  const stack = h('div', { class: 'stack' });
  // O texto colado e as sugestões ficam no estado persistido: recarregar a
  // página (ou derrubar o servidor) não faz você colar tudo de novo.
  if (!state.workspace) state.workspace = { cardsText: '', suggestions: null };
  let text = state.workspace.cardsText || ctx.params.prefill || '';
  let source = ctx.ui.cardsSource || '';

  const ta = h('textarea', {
    rows: 8,
    placeholder: 'Cole aqui um texto, uma lista de palavras, um diálogo ou uma transcrição em chinês…',
    value: text,
    onInput: (e) => {
      text = e.target.value;
    },
    onChange: (e) => {
      // Ao sair do campo, guarda em disco.
      ctx.commit((st) => {
        st.workspace.cardsText = e.target.value;
      }, { silent: true });
    },
  });

  stack.append(card('Criar cartões a partir de material real',
    h('p', { class: 'hint' },
      'Aceita texto colado, lista de palavras, diálogo ou transcrição. Importação de PDF e de áudio ' +
      'não está implementada nesta versão.'),
    ta,
    field('Origem (opcional, fica guardada com o cartão)',
      h('input', {
        type: 'text', value: source, placeholder: 'Ex.: conversa no futebol, aula de terça…',
        onInput: (e) => {
          source = e.target.value;
          ctx.ui.cardsSource = e.target.value;
        },
      })),
    h('div', { class: 'actions' },
      button('Gerar sugestões', () => {
        if (!text.trim()) {
          ctx.toast('Cole algum texto primeiro.', 'error');
          return;
        }
        const { drafts, stats } = generateDrafts(state, text, { source: source.trim() || 'texto colado' });
        if (!drafts.length) {
          ctx.toast('Nenhuma palavra ou frase em chinês encontrada no texto.', 'warn');
          return;
        }
        ctx.commit((st) => {
          st.workspace.cardsText = text;
          st.workspace.suggestions = {
            drafts,
            stats,
            selectedIds: drafts.filter((d) => !d.duplicate).map((d) => d.id),
            at: new Date().toISOString(),
          };
        });
      }),
      button('Limpar', () => {
        ctx.commit((st) => {
          st.workspace = { cardsText: '', suggestions: null };
        });
      }, { kind: 'ghost' }))));

  const gen = state.workspace.suggestions;
  if (gen) {
    const { drafts, stats } = gen;
    const selected = new Set(gen.selectedIds);
    const persistirSelecao = () => ctx.commit((st) => {
      st.workspace.suggestions.selectedIds = [...selected];
    }, { silent: true });
    const list = card(`Sugestões (${drafts.length})`,
      h('p', { class: 'hint' },
        `${stats.sentences} frase(s) e ${stats.words} palavra(s) do léxico. ` +
        `${stats.duplicates} possível(is) duplicata(s) — desmarcadas por padrão. ` +
        `${stats.unknown} caractere(s) fora do léxico local (sem pinyin automático).`),
      h('p', { class: 'hint' },
        'A tradução de frases é uma GLOSA palavra-a-palavra montada do léxico local, não uma tradução revisada. ' +
        'Edite antes de aprovar.'));

    for (const d of drafts) {
      const row = h('div', { class: 'draft' });
      const check = h('input', {
        type: 'checkbox', checked: selected.has(d.id),
        onChange: (e) => {
          if (e.target.checked) selected.add(d.id);
          else selected.delete(d.id);
          persistirSelecao();
        },
      });
      row.append(h('label', { class: 'row between' },
        h('span', {}, check, ' ', h('strong', { class: 'mono-zh' }, d.front)),
        h('span', {},
          d.duplicate ? badge('possível duplicata', 'warn') : badge('novo', 'ok'),
          ' ',
          badge(d.kind === 'sentence' ? 'frase' : 'palavra', 'neutral'),
          ' ',
          badge(`nível ${d.difficulty}`, 'neutral'))));
      row.append(h('div', { class: 'draft-body' },
        h('div', {}, h('small', { class: 'hint' }, 'Pinyin: '), d.pinyin || '—',
          d.confidence.pinyin !== 'alta' ? badge(`pinyin ${d.confidence.pinyin}`, 'warn') : null),
        h('div', {}, h('small', { class: 'hint' }, 'Verso: '), d.back || '—',
          d.needsReview ? badge('revisar tradução', 'warn') : null),
        d.example ? h('div', { class: 'hint mono-zh' }, `Exemplo: ${d.example}`) : null,
        ...(d.reviewNotes || []).map((n) => h('small', { class: 'hint' }, n))));
      list.append(row);
    }

    list.append(h('div', { class: 'actions' },
      button(`Salvar selecionados para revisão`, () => {
        const chosen = drafts.filter((d) => selected.has(d.id));
        if (!chosen.length) {
          ctx.toast('Selecione ao menos um cartão.', 'error');
          return;
        }
        const added = ctx.commit((s) => {
          const out = saveDrafts(s, chosen);
          s.workspace.suggestions = null;
          return out;
        }, { silent: true });
        ctx.ui.cardsTab = 'review';
        ctx.toast(`${added.length} cartão(ões) salvo(s) como pendente(s).`, 'success');
        ctx.render();
      }),
      button('Selecionar todos', () => {
        for (const d of drafts) selected.add(d.id);
        persistirSelecao();
      }, { kind: 'ghost' }),
      button('Descartar sugestões', () => {
        ctx.commit((st) => {
          st.workspace.suggestions = null;
        });
      }, { kind: 'ghost' })));
    stack.append(h('p', { class: 'hint' },
      `Sugestões geradas em ${formatDateTime(gen.at)} e guardadas: se você fechar o app agora, ` +
      'elas estarão aqui quando voltar.'));
    stack.append(list);
  }

  return stack;
}

function renderReview(ctx) {
  const { state } = ctx;
  const pending = state.cardDrafts.filter((d) => d.status === 'pending');
  const stack = h('div', { class: 'stack' });

  const semRevisar = pending.filter((d) => d.needsReview);
  stack.append(card('Revisar sugestões',
    h('p', { class: 'hint' },
      'Nada vai para o Anki sem aprovação. Editar o verso marca o cartão como revisado.'),
    pending.length ? null : emptyNote('Nenhum cartão pendente. Gere sugestões na aba "Gerar".'),
    pending.length
      ? h('div', {},
          h('p', { class: 'hint' },
            `${pending.length} pendente(s), ${semRevisar.length} com tradução gerada automaticamente ` +
            'ainda não conferida.'),
          h('div', { class: 'actions' },
            button(`Aprovar os ${pending.length - semRevisar.length} já conferidos`, () => {
              const prontos = pending.filter((d) => !d.needsReview && String(d.back || '').trim());
              if (!prontos.length) {
                ctx.toast('Nenhum cartão conferido para aprovar em massa.', 'error');
                return;
              }
              ctx.commit((s) => prontos.forEach((d) => setDraftStatus(s, d.id, 'approved')));
              ctx.toast(`${prontos.length} cartão(ões) aprovado(s).`, 'success');
            }, { kind: 'secondary', disabled: pending.length === semRevisar.length }),
            button('Aprovar TODOS os pendentes, inclusive os não conferidos', () => {
              const comVerso = pending.filter((d) => String(d.back || '').trim());
              if (!confirm(
                `Aprovar ${comVerso.length} cartão(ões) sem conferir as traduções geradas por máquina? ` +
                'Elas podem estar erradas e vão para o seu Anki assim.')) return;
              ctx.commit((s) => comVerso.forEach((d) => setDraftStatus(s, d.id, 'approved')));
              ctx.toast(`${comVerso.length} cartão(ões) aprovado(s) sem conferência.`, 'warn');
            }, { kind: 'ghost' })))
      : null));

  for (const d of pending) {
    const draftCard = card(null);
    draftCard.append(h('div', { class: 'row between' },
      h('strong', { class: 'mono-zh big' }, d.front),
      h('span', {}, d.duplicate ? badge('possível duplicata', 'warn') : null, ' ',
        badge(d.kind === 'sentence' ? 'frase' : 'palavra', 'neutral'))));

    const inputs = {};
    const textRow = (label, key, placeholder = '') => {
      inputs[key] = h('input', { type: 'text', value: d[key] ?? '', placeholder });
      return field(label, inputs[key]);
    };
    draftCard.append(h('div', { class: 'grid-2' },
      textRow('Frente (chinês)', 'front'),
      textRow('Verso (português)', 'back', 'Tradução revisada'),
      textRow('Pinyin', 'pinyin'),
      textRow('Exemplo', 'example'),
      textRow('Tradução do exemplo', 'exampleTranslation'),
      textRow('Contexto / categoria', 'context'),
      field('Tags (separadas por espaço)',
        (inputs.tags = h('input', { type: 'text', value: (d.tags || []).join(' ') }))),
      field('Modelo de cartão',
        select(Object.entries(CARD_TEMPLATES).map(([value, label]) => ({ value, label })), d.template,
          (v) => ctx.commit((s) => editDraft(s, d.id, { template: v }), { silent: true })))));

    // Áudio do cartão: voz sintetizada para conferir, gravação real para levar ao Anki.
    const audioRow = h('div', { class: 'audio-row' });
    if (canSpeak() && d.front) {
      audioRow.append(speakButton(d.front, { label: '🔊 Ouvir (voz sintetizada)', kind: 'ghost' }));
    }
    if (d.audio?.name) {
      // URL de blob não sobrevive a recarregar: resolvemos a cada desenho.
      const player = h('audio', { controls: 'controls' });
      urlDaMidia(d.audio, { db: ctx.store.db }).then((url) => {
        if (url) player.src = url;
        else audioRow.append(h('small', { class: 'hint' }, 'O arquivo deste áudio não foi encontrado.'));
      });
      audioRow.append(player);
      audioRow.append(button('Remover áudio', async () => {
        await removerMidia(d.audio, { db: ctx.store.db });
        ctx.commit((s) => editDraft(s, d.id, { audio: null }));
      }, { kind: 'ghost' }));
    }
    draftCard.append(audioRow);
    if (canRecord()) {
      draftCard.append(h('details', {},
        h('summary', {}, d.audio?.url ? 'Regravar áudio real' : 'Gravar áudio real (um colega falando)'),
        h('p', { class: 'hint' },
          'Áudio de gente real vale mais que voz sintetizada: é o som que você precisa reconhecer em campo. ' +
          'O arquivo vai junto no envio ao Anki.'),
        recordWidget({
          nomeBase: d.front,
          modo: ctx.store.mode,
          db: ctx.store.db,
          podeSalvar: ctx.store.mode === 'server' || ctx.store.mode === 'device',
          onSaved: (audio) => {
            ctx.commit((s) => editDraft(s, d.id, { audio: { ...audio, source: 'gravação real' } }));
            ctx.toast('Áudio anexado ao cartão.', 'success');
          },
        })));
    }

    if (d.needsReview || (d.reviewNotes || []).length) {
      draftCard.append(h('div', { class: 'callout' },
        ...(d.reviewNotes || []).map((n) => h('div', {}, n))));
    }
    draftCard.append(h('small', { class: 'hint' },
      `Origem: ${d.source} · gerado em ${formatDateTime(d.createdAt)}`));

    draftCard.append(h('div', { class: 'actions' },
      button('Salvar edições', () => {
        ctx.commit((s) => editDraft(s, d.id, {
          front: inputs.front.value.trim(),
          back: inputs.back.value.trim(),
          pinyin: inputs.pinyin.value.trim(),
          example: inputs.example.value.trim(),
          exampleTranslation: inputs.exampleTranslation.value.trim(),
          context: inputs.context.value.trim(),
          tags: inputs.tags.value.split(/\s+/).filter(Boolean),
        }), { silent: true });
        ctx.toast('Edições salvas.', 'success');
        ctx.render();
      }, { kind: 'secondary' }),
      button('Aprovar', () => {
        if (!inputs.back.value.trim()) {
          ctx.toast('Preencha o verso antes de aprovar.', 'error');
          return;
        }
        ctx.commit((s) => {
          editDraft(s, d.id, {
            front: inputs.front.value.trim(),
            back: inputs.back.value.trim(),
            pinyin: inputs.pinyin.value.trim(),
            example: inputs.example.value.trim(),
            exampleTranslation: inputs.exampleTranslation.value.trim(),
            context: inputs.context.value.trim(),
            tags: inputs.tags.value.split(/\s+/).filter(Boolean),
          });
          setDraftStatus(s, d.id, 'approved');
        });
      }),
      button('Rejeitar', () => ctx.commit((s) => setDraftStatus(s, d.id, 'rejected')), { kind: 'ghost' }),
      button('Excluir', () => ctx.commit((s) => removeDraft(s, d.id)), { kind: 'ghost' })));
    stack.append(draftCard);
  }

  const rejected = state.cardDrafts.filter((d) => d.status === 'rejected');
  if (rejected.length) {
    stack.append(card(`Rejeitados (${rejected.length})`,
      h('div', { class: 'chips' }, ...rejected.map((d) =>
        h('span', { class: 'chip mono-zh' }, d.front,
          button('↺', () => ctx.commit((s) => setDraftStatus(s, d.id, 'pending')), { kind: 'ghost', title: 'Voltar para pendentes' }))))));
  }
  return stack;
}

function renderExport(ctx) {
  const { state } = ctx;
  const approved = state.cardDrafts.filter((d) => d.status === 'approved');
  const stack = h('div', { class: 'stack' });

  stack.append(card(`Exportar ${approved.length} cartão(ões) aprovado(s)`,
    approved.length ? null : emptyNote('Aprove cartões na aba "Revisar" para poder exportar.'),
    approved.length
      ? h('div', {},
          h('p', { class: 'hint' }, `Colunas do arquivo: ${EXPORT_FIELDS.map(([, l]) => l).join(', ')}.`),
          h('div', { class: 'chips' }, ...approved.map((d) => h('span', { class: 'chip mono-zh' }, d.front))),
          h('div', { class: 'actions' },
            button('Baixar TSV (recomendado para o Anki)', () => {
              const name = exportFilename('tsv');
              downloadText(name, toTsv(approved), 'text/tab-separated-values;charset=utf-8');
              ctx.commit((s) => recordExport(s, { cards: approved, destination: 'arquivo', format: 'tsv', status: 'ok' }));
              ctx.toast(`${approved.length} cartão(ões) exportado(s) em ${name}.`, 'success');
            }),
            button('Baixar CSV', () => {
              const name = exportFilename('csv');
              downloadText(name, toCsv(approved), 'text/csv;charset=utf-8');
              ctx.commit((s) => recordExport(s, { cards: approved, destination: 'arquivo', format: 'csv', status: 'ok' }));
              ctx.toast(`${approved.length} cartão(ões) exportado(s) em ${name}.`, 'success');
            }, { kind: 'secondary' })),
          approved.some((d) => d.audio?.name)
            ? h('p', { class: 'hint' },
                'A coluna "Audio" sai no formato [sound:arquivo.webm]. Para o arquivo TSV, copie os ' +
                'áudios de data/media/ para a pasta collection.media do seu perfil do Anki — ou use o ' +
                'envio por AnkiConnect abaixo, que leva os arquivos automaticamente.')
            : null,
          h('details', {}, h('summary', {}, 'Como importar no Anki'),
            h('ol', { class: 'tight' },
              h('li', {}, 'No Anki: Arquivo → Importar e escolha o arquivo baixado.'),
              h('li', {}, 'Separador: tabulação (TSV) ou vírgula (CSV); marque "primeira linha é cabeçalho".'),
              h('li', {}, 'Mapeie as colunas para os campos do seu modelo de nota.'),
              h('li', {}, 'Escolha o baralho de destino e confirme.'))))
      : null));

  stack.append(renderAnkiConnect(ctx, approved));

  const history = state.cardExports.slice().reverse();
  stack.append(card('Histórico de exportações',
    history.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Quando'), h('th', {}, 'Destino'), h('th', {}, 'Cartões'), h('th', {}, 'Status'))),
          h('tbody', {}, ...history.map((e) => h('tr', {},
            h('td', {}, formatDateTime(e.at)),
            h('td', {}, `${e.destination}${e.format ? ` (${e.format})` : ''}`),
            h('td', {}, String(e.count)),
            h('td', {}, e.status === 'ok' ? badge('enviado', 'ok') : badge(e.error || 'erro', 'error'))))))
      : emptyNote('Nenhuma exportação registrada.')));

  return stack;
}

function renderAnkiConnect(ctx, approved) {
  const { state } = ctx;
  const anki = ctx.ui.anki || (ctx.ui.anki = { status: null, fields: null, fieldMap: { Front: 'front', Back: 'back' } });
  const box = card('Integração direta com o Anki (AnkiConnect)');
  box.append(h('p', { class: 'hint' },
    'Requer o Anki Desktop aberto nesta máquina com o add-on AnkiConnect instalado e este endereço ' +
    'autorizado em webCorsOriginList. Se isso não estiver configurado, use a exportação de arquivo acima.'));

  let url = state.settings.ankiConnectUrl;
  let deck = state.settings.ankiDeck;
  let model = state.settings.ankiModel;

  box.append(h('div', { class: 'grid-2' },
    field('Endereço do AnkiConnect', h('input', { type: 'text', value: url, onInput: (e) => (url = e.target.value) })),
    field('Baralho de destino', h('input', { type: 'text', value: deck, onInput: (e) => (deck = e.target.value) })),
    field('Modelo de nota', h('input', { type: 'text', value: model, onInput: (e) => (model = e.target.value) }))));

  if (anki.status) {
    box.append(h('div', { class: anki.status.ok ? 'callout' : 'banner banner-error' }, anki.status.message));
  }
  if (anki.fields) {
    box.append(h('h4', {}, 'Mapeamento de campos'));
    box.append(h('p', { class: 'hint' }, `Campos encontrados no modelo "${model}". Escolha o que entra em cada um.`));
    for (const f of anki.fields) {
      box.append(field(f, select(
        [{ value: '', label: '(vazio)' }, ...EXPORT_FIELDS.map(([key, label]) => ({ value: key, label }))],
        anki.fieldMap[f] || '',
        (v) => {
          if (v) anki.fieldMap[f] = v;
          else delete anki.fieldMap[f];
        },
      )));
    }
  }

  box.append(h('div', { class: 'actions' },
    button('Testar conexão', async () => {
      ctx.commit((s) => {
        s.settings.ankiConnectUrl = url;
        s.settings.ankiDeck = deck;
        s.settings.ankiModel = model;
      }, { silent: true });
      const conn = await checkConnection({ url });
      if (!conn.ok) {
        anki.status = { ok: false, message: `Falha ao conectar: ${conn.error}` };
        anki.fields = null;
      } else {
        const fieldsRes = await modelFields(model, { url });
        anki.status = {
          ok: true,
          message: `Conectado ao AnkiConnect (versão ${conn.version}).` +
            (fieldsRes.ok ? '' : ` Não foi possível ler os campos do modelo "${model}": ${fieldsRes.error}`),
        };
        anki.fields = fieldsRes.ok ? fieldsRes.result : null;
        if (anki.fields) {
          anki.fieldMap = Object.fromEntries(Object.entries(anki.fieldMap).filter(([k]) => anki.fields.includes(k)));
        }
      }
      ctx.render();
    }, { kind: 'secondary' }),
    button(`Enviar ${approved.length} cartão(ões) ao Anki`, async () => {
      if (!approved.length) {
        ctx.toast('Nada aprovado para enviar.', 'error');
        return;
      }
      if (!Object.keys(anki.fieldMap).length) {
        ctx.toast('Teste a conexão e defina o mapeamento de campos antes de enviar.', 'error');
        return;
      }
      const comAudio = approved.filter((c) => c.audio?.name);
      const media = [];
      for (const card of comAudio) {
        const resolvido = await midiaEmBase64(card.audio, { db: ctx.store.db });
        if (resolvido.ok) media.push({ filename: card.audio.name, data: resolvido.data });
        else ctx.toast(`Não foi possível ler o áudio de ${card.front}: ${resolvido.error}`, 'warn');
      }
      const res = await addCards(approved, { deck, model, fieldMap: anki.fieldMap, url, media });
      if (!res.ok) {
        ctx.commit((s) => recordExport(s, { cards: approved, destination: 'ankiconnect', status: 'erro', error: `${res.stage}: ${res.error}` }));
        ctx.toast(`Falha no envio (${res.stage}): ${res.error}`, 'error');
        return;
      }
      ctx.commit((s) => {
        recordExport(s, {
          cards: res.added.map((a) => a.card),
          destination: 'ankiconnect',
          status: 'ok',
        });
        if (res.rejected.length) {
          recordExport(s, {
            cards: res.rejected, destination: 'ankiconnect', status: 'erro',
            error: 'recusadas pelo Anki (possível duplicata)',
          });
        }
      });
      ctx.toast(res.message, res.partial ? 'warn' : 'success');
    }, { kind: 'primary', disabled: !approved.length })));

  const comAudio = approved.filter((c) => c.audio?.name).length;
  if (comAudio) {
    box.append(h('small', { class: 'hint' },
      `${comAudio} cartão(ões) têm áudio gravado. Mapeie um campo do modelo para "Audio" e o arquivo ` +
      'é enviado antes das notas — se o áudio falhar, a nota não promete áudio que não existe.'));
  }

  return box;
}
