import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Starter templates. Each one is a field list, not a form document: create
 * the form with create_form (title + content_type), then call create_field
 * once per entry, in order. Field types are the canonical camelCase names
 * create_field accepts.
 */
const TEMPLATES = [
  {
    id: 'lead-capture',
    title: 'Lead capture form',
    description: 'Name, email, phone, and a single question.',
    usage: 'create_form({ title, content_type }) then create_field(form_id, ...field) for each field in order.',
    content_type: 'form',
    fields: [
      { type: 'shortAnswer', label: 'Full name', required: true },
      { type: 'email', label: 'Email', required: true },
      { type: 'phone', label: 'Phone', required: false },
      { type: 'longAnswer', label: 'How can we help?', required: false },
    ],
  },
  {
    id: 'nps',
    title: 'NPS survey',
    description: '0-10 Net Promoter Score plus a follow-up reason.',
    usage: 'create_form({ title, content_type }) then create_field(form_id, ...field) for each field in order.',
    content_type: 'form',
    fields: [
      { type: 'npsScore', label: 'How likely are you to recommend us to a friend or colleague?', required: true },
      { type: 'longAnswer', label: 'What is the main reason for your score?', required: false },
    ],
  },
  {
    id: 'product-quiz',
    title: 'Product recommendation quiz',
    description:
      'Skeleton quiz with 5 multiple-choice questions. Define personality types with update_quiz_settings (scoringMode "personality", personalityTypes), then give each option a personalityTypeId via option_objects.',
    usage: 'create_form({ title, content_type: "quiz" }), update_quiz_settings(...), then create_field(form_id, ...field) for each field in order.',
    content_type: 'quiz',
    fields: [
      { type: 'multipleChoice', label: 'What is your goal?', options: ['Productivity', 'Health', 'Learning', 'Fun'], required: true },
      { type: 'multipleChoice', label: 'How much time per week?', options: ['<1h', '1-3h', '3-6h', '6+h'], required: true },
      { type: 'multipleChoice', label: 'Budget?', options: ['Free', '<$10', '$10-50', '$50+'], required: true },
      { type: 'multipleChoice', label: 'Experience level?', options: ['Beginner', 'Intermediate', 'Advanced'], required: true },
      { type: 'multipleChoice', label: 'Preferred medium?', options: ['Video', 'Text', 'Audio', 'Mixed'], required: true },
    ],
  },
  {
    id: 'contact',
    title: 'Contact form',
    description: 'Name, email, subject, message.',
    usage: 'create_form({ title, content_type }) then create_field(form_id, ...field) for each field in order.',
    content_type: 'form',
    fields: [
      { type: 'shortAnswer', label: 'Name', required: true },
      { type: 'email', label: 'Email', required: true },
      { type: 'shortAnswer', label: 'Subject', required: true },
      { type: 'longAnswer', label: 'Message', required: true },
    ],
  },
] as const;

export function registerTemplateResources(server: McpServer): void {
  server.registerResource(
    'templates',
    'uplup://templates',
    {
      title: 'Uplup form templates',
      description:
        'Starter field lists (not form documents). For each template: create the form with create_form, then call create_field once per field in order. The NPS template uses the npsScore field type.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(TEMPLATES, null, 2),
        },
      ],
    }),
  );
}
