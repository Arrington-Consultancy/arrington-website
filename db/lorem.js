/**
 * Lorem ipsum placeholder content for freshly-added sections.
 * Used by the "Add section" flow so new picks start with neutral
 * placeholder text rather than copying the current page's content.
 *
 * Keys are suffixes (everything after the instance prefix). For
 * credentials we use two sub-prefixes (`_oxford` and `_stat`) — each
 * sub-prefix has its own entry here.
 */
const lorem = {
  hero: {
    'heading': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit',
    'subtext': 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.',
    'cta': 'Lorem ipsum',
    'whatsapp': ''
  },
  credentials_oxford: {
    'title': 'Lorem ipsum',
    'text': 'Consectetur adipiscing elit. Sed do eiusmod.'
  },
  credentials_stat: {
    'stat': '10x',
    'text': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.'
  },
  biography: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet',
    'col_1_p1': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.',
    'col_1_p2': '<strong>Duis aute irure dolor</strong> in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    'col_2_p1': 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error.',
    'col_2_p2': 'Sit voluptatem accusantium doloremque laudantium, totam rem aperiam eaque ipsa quae ab illo inventore veritatis.'
  },
  intervention: {
    'heading': '<strong>Lorem Ipsum</strong>',
    'subtext': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna <strong>aliqua enim ad minim</strong>.',
    'button_text': '',
    'button_link': 'main'
  },
  approach: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet consectetur',
    'step_1_title': 'Lorem ipsum',
    'step_1_body': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna.',
    'step_2_title': 'Dolor sit amet',
    'step_2_body': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'step_3_title': 'Consectetur',
    'step_3_body': 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
  },
  insights: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet consectetur',
    'subtext': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.',
    'card_1_tag': 'Lorem',
    'card_1_title': 'Lorem ipsum dolor sit amet consectetur',
    'card_1_body': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.',
    'card_2_tag': 'Ipsum',
    'card_2_title': 'Ut enim ad minim veniam quis nostrud',
    'card_2_body': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip.',
    'card_3_tag': 'Dolor',
    'card_3_title': 'Duis aute irure dolor in reprehenderit',
    'card_3_body': 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.'
  },
  fourcards: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet consectetur',
    'card_1_number': '01',
    'card_1_title': 'Lorem ipsum',
    'card_1_body': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.',
    'card_2_number': '02',
    'card_2_title': 'Dolor sit',
    'card_2_body': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'card_3_number': '03',
    'card_3_title': 'Amet consectetur',
    'card_3_body': 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
    'card_4_number': '04',
    'card_4_title': 'Adipiscing elit',
    'card_4_body': 'Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia.'
  },
  documents: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet',
    'intro': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'doc_1_title': 'Lorem ipsum',
    'doc_1_blurb': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.',
    'doc_1_meta': 'PDF',
    'doc_1_file': '',
    'doc_1_image': '',
    'doc_2_title': 'Dolor sit amet',
    'doc_2_blurb': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'doc_2_meta': 'PDF',
    'doc_2_file': '',
    'doc_2_image': '',
    'doc_3_title': 'Consectetur adipiscing',
    'doc_3_blurb': 'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.',
    'doc_3_meta': 'PDF',
    'doc_3_file': '',
    'doc_3_image': '',
    'doc_4_title': 'Tempor incididunt',
    'doc_4_blurb': 'Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia.',
    'doc_4_meta': 'PDF',
    'doc_4_file': '',
    'doc_4_image': ''
  },
  casestudy: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem Ipsum Project',
    'subtext': 'Lorem ipsum dolor sit amet. Consectetur adipiscing elit.',
    'phase_1_label': 'Lorem',
    'phase_1_body': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'phase_2_label': 'Ipsum',
    'phase_2_body': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea <strong>commodo consequat</strong>.',
    'phase_3_label': 'Dolor',
    'phase_3_body': '<strong>Duis aute irure dolor</strong> in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.'
  },
  casestudy2: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem Ipsum Story',
    'intro': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor.',
    'body': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
    'outcome': 'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt <strong>mollit anim id est laborum</strong>.'
  },
  assessment: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet',
    'intro': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'q_1': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit?',
    'q_2': 'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua?',
    'q_3': 'Ut enim ad minim veniam, quis nostrud exercitation?',
    'q_4': 'Duis aute irure dolor in reprehenderit in voluptate?',
    'q_5': 'Excepteur sint occaecat cupidatat non proident?',
    'q_6': 'Sunt in culpa qui officia deserunt mollit anim id est laborum?'
  },
  filter: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet',
    'p1': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'p2': 'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
    'button_text': '',
    'button_link': 'main'
  },
  proofstrip: {
    'label': 'What I have done',
    'row_1_action': 'Built and exited',
    'row_1_client': 'Abacus and Falmouth Taxis',
    'row_2_action': 'Turned around',
    'row_2_client': 'Devon marine firm',
    'row_3_action': 'Improved margin',
    'row_3_client': 'South West aesthetic clinics'
  },
  contact: {
    'label': 'Lorem ipsum',
    'heading': 'Lorem ipsum dolor sit amet',
    'body': 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt.',
    'email': 'lorem@example.com',
    'phone': '01234 567890'
  }
};

module.exports = lorem;
