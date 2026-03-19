import { askUserQuestionAction } from '../src/wtc/actions/ask_user_question';

import { installMockSillyTavern } from './helpers/mock_sillytavern';
import { expectToolError } from './helpers/tool_assert';

describe('askUserQuestionAction', () => {
  test('returns submitted answer, including empty string', async () => {
    installMockSillyTavern({ popupResult: '' });

    const result = await askUserQuestionAction({ question: '请输入备注' });

    expect(result).toStrictEqual({
      question: '请输入备注',
      answer: '',
    });
  });

  test('returns USER_REJECTED when user cancels input', async () => {
    installMockSillyTavern({ popupResult: false });

    const error = await expectToolError(askUserQuestionAction({ question: '请输入备注' }));

    expect(error.errorType).toBe('USER_REJECTED');
  });
});
