import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const TEMPLATES = [
  {
    id: 'lead-capture',
    title: 'Lead capture form',
    description: 'Name, email, phone, and a single question.',
    body: {
      content_type: 'form',
      fields: [
        { type: 'text', label: 'Full name', required: true },
        { type: 'email', label: 'Email', required: true },
        { type: 'phone', label: 'Phone', required: false },
        { type: 'textarea', label: 'How can we help?', required: false },
      ],
    },
  },
  {
    id: 'nps',
    title: 'NPS survey',
    description: '0-10 score plus a follow-up reason.',
    body: {
      content_type: 'form',
      fields: [
        { type: 'rating', label: 'How likely are you to recommend us?', required: true, options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] },
        { type: 'textarea', label: 'What is the main reason for your score?', required: false },
      ],
    },
  },
  {
    id: 'product-quiz',
    title: 'Product recommendation quiz',
    description: 'Skeleton quiz with 5 multiple-choice questions and outcome rules.',
    body: {
      content_type: 'quiz',
      fields: [
        { type: 'radio', label: 'What is your goal?', options: ['Productivity', 'Health', 'Learning', 'Fun'], required: true },
        { type: 'radio', label: 'How much time per week?', options: ['<1h', '1-3h', '3-6h', '6+h'], required: true },
        { type: 'radio', label: 'Budget?', options: ['Free', '<$10', '$10-50', '$50+'], required: true },
        { type: 'radio', label: 'Experience level?', options: ['Beginner', 'Intermediate', 'Advanced'], required: true },
        { type: 'radio', label: 'Preferred medium?', options: ['Video', 'Text', 'Audio', 'Mixed'], required: true },
      ],
    },
  },
  {
    id: 'contact',
    title: 'Contact form',
    description: 'Name, email, subject, message.',
    body: {
      content_type: 'form',
      fields: [
        { type: 'text', label: 'Name', required: true },
        { type: 'email', label: 'Email', required: true },
        { type: 'text', label: 'Subject', required: true },
        { type: 'textarea', label: 'Message', required: true },
      ],
    },
  },
] as const;

export function registerTemplateResources(server: McpServer): void {
  server.registerResource(
    'templates',
    'uplup://templates',
    {
      title: 'Uplup form templates',
      description: 'Starter templates that can be passed as the document argument to create_form.',
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
