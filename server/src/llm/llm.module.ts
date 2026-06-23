import { Global, Module } from '@nestjs/common';
import { LlmProvider } from './llm.provider';
import { MockLlmProvider } from './mock.provider';
import { OpenAiProvider } from './openai.provider';

/**
 * Binds LlmProvider to OpenAI when LLM_PROVIDER=openai AND a key is present; otherwise the
 * deterministic mock. Global so the templates module injects it without re-importing.
 */
@Global()
@Module({
  providers: [
    {
      provide: LlmProvider,
      useClass:
        process.env.LLM_PROVIDER === 'openai' && process.env.OPENAI_API_KEY ? OpenAiProvider : MockLlmProvider,
    },
  ],
  exports: [LlmProvider],
})
export class LlmModule {}
