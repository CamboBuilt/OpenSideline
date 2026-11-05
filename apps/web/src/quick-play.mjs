/**
 * Fast, validated suggestions for the scorekeeper.
 *
 * These are common example outcomes, never baseball scoring judgments.
 * Validation reuses the domain engine so a shortcut cannot bypass game rules.
 */
import { appendEvent, defaultPlayAdvances } from '../../../packages/scoring-engine/src/index.mjs';

export function getQuickPlayPresets(game, view, result) {
  const starting = defaultPlayAdvances(view, result);
  const suggestions = [];
  const seen = new Set();

  function suggest(label, modify) {
    const advances = {
      batter: starting.batter,
      runners: { ...starting.runners },
      rbi: [...starting.rbi],
    };
    modify?.(advances);
    const key = JSON.stringify(advances);
    if (seen.has(key)) return;
    try {
      appendEvent(game, { type: 'BALL_IN_PLAY', result, advances });
      suggestions.push({ label, advances });
      seen.add(key);
    } catch { /* This preset isn't legal in the current situation. */ }
  }

  suggest('Suggested advance');

  // Suggestions are evaluated against the complete inning state before display.
  if (view.bases[2] && result === 'SINGLE') {
    suggest('Runner on 2nd scores', a => {
      a.runners['2'] = 'HOME';
      if (!a.rbi.includes('2')) a.rbi.push('2');
    });
  }
  if (view.bases[1] && result === 'SINGLE') {
    suggest('Runner on 1st to 3rd', a => { a.runners['1'] = 'THIRD'; });
  }
  if (view.bases[1] && result === 'DOUBLE') {
    suggest('Runner on 1st holds', a => { a.runners['1'] = 'HOLD'; });
  }
  if (view.bases[3] && result === 'GROUND_OUT' && view.outs < 2) {
    suggest('Runner on 3rd scores (RBI)', a => {
      a.runners['3'] = 'HOME';
      if (!a.rbi.includes('3')) a.rbi.push('3');
    });
  }
  if (view.bases[3] && result === 'OUT' && view.outs < 2) {
    suggest('Runner on 3rd scores', a => {
      a.runners['3'] = 'HOME';
      a.rbi = a.rbi.filter(key => key !== '3');
    });
  }
  if (view.bases[1] && !['HOME_RUN', 'SAC_FLY', 'FIELDERS_CHOICE'].includes(result)) {
    suggest('Runner on 1st is out', a => {
      a.runners['1'] = 'OUT';
      a.rbi = a.rbi.filter(key => key !== '1');
    });
  }
  return suggestions;
}
