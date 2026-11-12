import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'build_quiz',
    {
      title: 'Build a quiz',
      description: 'Walks through creating a multi-question scored quiz with a pass mark and results display.',
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
              `2. For each question call create_field with type="multipleChoice", 3-4 options, correct_answer set to the right option label, and points.\n` +
              `3. Call update_quiz_settings with scoringMode="percentage", passingScore (e.g. 70) and passingScoreType="percentage", plus resultsDisplay (showScore, showCorrectAnswers="after_submit", showExplanations).\n` +
              `4. Show the user the form id and offer to publish_form.`,
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
              `2. Add fields with create_field: full name (shortAnswer, required), email (email, required), phone (phone, optional), and one tailored open-ended question (longAnswer) relevant to the purpose.\n` +
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
        period: z.string().optional().describe('Analytics window: 7d, 30d, 90d or all (default 30d).'),
      },
    },
    ({ form_id, period }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text:
              `Summarize submission trends for form ${form_id} over the ${period ?? '30d'} period.\n\nSteps:\n` +
              `1. Call get_form_analytics (period="${period ?? '30d'}") for totals and conversion rate, get_submission_analytics (same period, group_by="day" or "week") for the trend, get_geography_analytics for countries, and get_performance_analytics for hour-of-day and weekday patterns.\n` +
              `2. Call list_submissions (limit 100, sort="newest") to sample recent answers.\n` +
              `3. Identify: total submissions, conversion rate, trend direction, top countries, busiest hours/days, common open-ended themes.\n` +
              `4. Surface 3-5 actionable insights grounded in those numbers.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'build_survey',
    {
      title: 'Build a survey',
      description: 'Walks through creating a survey with rating scales, NPS, and open-ended fields.',
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
              `   - 1-2 starRating or likertScale fields for satisfaction / agreement\n` +
              `   - 2-3 multipleChoice fields for segmentation\n` +
              `   - 1 longAnswer for open-ended feedback\n` +
              (include_nps !== 'false' ? `   - 1 npsScore field (0-10) for Net Promoter Score\n` : '') +
              `3. Use update_form_design to apply a clean, neutral look (primary_color, font_family).\n` +
              `4. Offer publish_form once the user reviews.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'manage_quiz_scoring',
    {
      title: 'Configure quiz scoring and results',
      description: 'Walk a user through scoring rules, pass mark, retakes, randomization and results display on an existing quiz.',
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
              `   - scoringMode (points / percentage / pass_fail / personality)\n` +
              `   - passingScore and passingScoreType (percentage / points)\n` +
              `   - retakePolicy (allowRetakes, maxAttempts, cooldownPeriod in minutes, keepBestScore)\n` +
              `   - questionBehavior (randomizeQuestions, randomizeAnswers, instantFeedback, showProgressBar)\n` +
              `   - resultsDisplay (showScore, showPercentage, showCorrectAnswers: always / after_submit / never, showExplanations)\n` +
              `   - timing (totalTimeLimit in minutes, perQuestionTimeLimit in seconds)\n` +
              `   - for personality quizzes: personalityTypes and personalitySettings\n` +
              `3. For each question, confirm the correct_answer (or accepted_answers for text questions) and points using update_field.\n` +
              `4. Call update_quiz_settings with only the camelCase keys that should change.\n` +
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
      description: 'Answer distribution and response rate per field, computed from a sample of submissions, to find questions worth rewording or dropping.',
      argsSchema: {
        form_id: z.string().describe('Form id from list_forms.'),
        sample_size: z.string().optional().describe('Submissions to sample, up to 100 per call (default 100).'),
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
              `2. Call get_form_analytics and get_submission_analytics for overall conversion and the recent trend.\n` +
              `3. Call list_submissions with limit ${sample_size ?? 100} (paginate with offset for more) to sample answers.\n` +
              `4. For each field compute from the sample: response rate (how often it was answered), average answer length (text), top values (choice).\n` +
              `5. Rank questions by low response rate and propose 3 specific edits ` +
              `(rewording, making optional, adding helper text, splitting into multiple fields). ` +
              `Note: the API does not report per-field drop-off, so base the diagnosis on answered vs. blank values in the sample.`,
          },
        },
      ],
    }),
  );
}
