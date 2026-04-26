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

  server.registerPrompt(
    'build_survey',
    {
      title: 'Build a survey',
      description: 'Walks through creating a survey with rating scales, ranking, NPS, and open-ended fields.',
      argsSchema: {
        topic: z.string().describe('What the survey is measuring.'),
        question_count: z.string().optional().describe('Approximate number of questions (default 8).'),
        include_nps: z.string().optional().describe('"true" to include an NPS question (default true).'),
      },
    },
    ({ topic, question_count, include_nps }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Build a ${question_count ?? 8}-question survey about "${topic}".\n\nSteps:\n` +
              `1. Call create_form with content_type="form" and a clear title.\n` +
              `2. Add a mix of question types via create_field:\n` +
              `   - 1-2 rating fields (type="rating") for satisfaction / agreement\n` +
              `   - 2-3 multipleChoice or radio for segmentation\n` +
              `   - 1 longAnswer for open-ended feedback\n` +
              (include_nps !== 'false' ? `   - 1 scale field (0-10) for NPS\n` : '') +
              `3. Use update_form_design to apply a theme that matches a survey context (clean, neutral colours).\n` +
              `4. Offer publish_form once the user reviews.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'manage_quiz_scoring',
    {
      title: 'Configure quiz scoring + outcomes',
      description: 'Walk a user through setting up scoring rules, outcomes, randomization, and retake policy on an existing quiz.',
      argsSchema: {
        form_id: z.string().describe('Quiz form id.'),
      },
    },
    ({ form_id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Help me configure scoring on quiz ${form_id}.\n\nSteps:\n` +
              `1. Call get_quiz_settings and list_fields to inspect current state.\n` +
              `2. Walk through the user's preferences for:\n` +
              `   - scoring_method (points / percentage / pass_fail / personality)\n` +
              `   - passing_score and outcome bands\n` +
              `   - retake_policy (allow_retakes, max_attempts, cooldown)\n` +
              `   - question_behavior (randomize_questions, randomize_answers, instant_feedback)\n` +
              `   - results_display (show_score, show_correct_answers timing)\n` +
              `3. For each question, confirm the correct_answer + points using update_field.\n` +
              `4. Call update_quiz_settings to apply the chosen rules.\n` +
              `5. Recommend publish_form once configured.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'analyze_responses_by_field',
    {
      title: 'Per-field response breakdown',
      description: 'Drop-off, completion time, and answer distribution per field — surfaces which questions are hurting conversion.',
      argsSchema: {
        form_id: z.string().describe('Form id from list_forms.'),
        sample_size: z.string().optional().describe('Submissions to sample (default 200).'),
      },
    },
    ({ form_id, sample_size }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Diagnose form ${form_id} field-by-field.\n\nSteps:\n` +
              `1. Call list_fields to get the question list.\n` +
              `2. Call get_performance_analytics to see drop-off rate per field.\n` +
              `3. Call list_submissions with limit ${sample_size ?? 200} to sample answers.\n` +
              `4. For each field compute: response rate, average answer length (text), top values (choice).\n` +
              `5. Rank questions by drop-off impact and propose 3 specific edits ` +
              `(rewording, making optional, adding helper text, splitting into multiple fields).`,
          },
        },
      ],
    }),
  );
}
