import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'build_quiz',
    {
      title: 'Build a quiz',
      description: 'Walks through creating a multi-question quiz with scoring and outcomes.',
      argsSchema: {
        topic: z.string().describe('Quiz topic, e.g. "Greek mythology" or "fitness goals".'),
        question_count: z.string().optional().describe('Approximate number of questions (default 5).'),
        audience: z.string().optional().describe('Target audience.'),
      },
    },
    ({ topic, question_count, audience }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Create a ${question_count ?? 5}-question quiz about "${topic}"` +
              (audience ? ` for ${audience}` : '') +
              `.\n\nSteps:\n` +
              `1. Call create_form with content_type="quiz" and a clear title.\n` +
              `2. For each question call create_field with type="radio" and 3-4 options.\n` +
              `3. Call update_quiz_settings to set passing_score and outcomes (e.g. Beginner / Intermediate / Expert).\n` +
              `4. Show the user the form url and offer to publish_form.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'build_lead_form',
    {
      title: 'Build a lead-capture form',
      description: 'Creates a name/email/phone form with one tailored question.',
      argsSchema: {
        purpose: z.string().describe('What the user is collecting leads for.'),
      },
    },
    ({ purpose }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Build a lead-capture form for: ${purpose}.\n\nSteps:\n` +
              `1. Call create_form with content_type="form" and a clear title.\n` +
              `2. Add fields: full name (text, required), email (email, required), phone (phone, optional), and one tailored open-ended question relevant to the purpose.\n` +
              `3. Call update_form_design to set primary_color matching the user's brand if they mentioned one.\n` +
              `4. Offer publish_form once the user is happy.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'analyze_submissions',
    {
      title: 'Analyze form submissions',
      description: 'Summarize trends across recent submissions on a form.',
      argsSchema: {
        form_id: z.string().describe('Form id from list_forms.'),
        last_n_days: z.string().optional().describe('Look back N days (default 30).'),
      },
    },
    ({ form_id, last_n_days }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Summarize submission trends for form ${form_id} over the last ${last_n_days ?? 30} days.\n\nSteps:\n` +
              `1. Call get_form_analytics, get_submission_analytics, get_geography_analytics for the date range.\n` +
              `2. Call list_submissions (limit 100) to sample recent answers.\n` +
              `3. Identify: total submissions, conversion rate trend, top countries, common open-ended themes, drop-off fields.\n` +
              `4. Surface 3-5 actionable insights (e.g. "field X causes 40% drop-off").`,
          },
        },
      ],
    }),
  );
}
