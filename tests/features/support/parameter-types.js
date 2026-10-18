import { defineParameterType } from '@cucumber/cucumber';
import { SiteSource } from './site-source.js';

const { PixEngine } = await SiteSource.load('js/load-test/pix-engine.js');

/** R$ 1.234,50 in the feature text is the number 1234.5 in the step. */
defineParameterType({
  name: 'reais',
  regexp: /R\$ ?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?/,
  transformer: (text) =>
    Number(text.replace('R$', '').trim().replaceAll('.', '').replace(',', '.')),
});

/** A decimal number written the Brazilian way: 2,5 is 2.5. */
defineParameterType({
  name: 'decimal',
  regexp: /\d+(?:,\d+)?/,
  transformer: (text) => Number(text.replace(',', '.')),
});

/** What a payment ends as, in the words of the features. */
defineParameterType({
  name: 'desfecho',
  regexp: /aceito|recusado como inválido|recusado por falta de saldo|barrado como duplicado/,
  transformer: (text) =>
    ({
      aceito: PixEngine.OUTCOMES.ACCEPTED,
      'recusado como inválido': PixEngine.OUTCOMES.INVALID,
      'recusado por falta de saldo': PixEngine.OUTCOMES.INSUFFICIENT_FUNDS,
      'barrado como duplicado': PixEngine.OUTCOMES.DUPLICATE,
    })[text],
});
