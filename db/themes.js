/**
 * Site colour themes. Each theme defines CSS custom property values.
 * The active theme key is stored in the content table as 'site.theme'.
 */
const themes = {
  dark: {
    label: 'Dark',
    swatch: '#0a0a0a',
    vars: {
      '--black': '#0a0a0a',
      '--near-black': '#151515',
      '--dark-grey': '#1e1e1e',
      '--charcoal': '#272727',
      '--mid-grey': '#333333',
      '--accent': '#c47a3a',
      '--accent-hover': '#a8632e',
      '--warm-white': '#f5f3ef',
      '--cream': '#eae6df',
      '--text': '#d4d0c8',
      '--text-muted': '#8a8680',
      '--text-bright': '#f0ece6',
      '--border': 'rgba(255,255,255,0.06)'
    }
  },
  oxford: {
    label: 'Oxford Blue',
    swatch: '#002147',
    vars: {
      '--black': '#001229',
      '--near-black': '#001a38',
      '--dark-grey': '#002147',
      '--charcoal': '#0a3060',
      '--mid-grey': '#1a4070',
      '--accent': '#c8a44e',
      '--accent-hover': '#b08e3a',
      '--warm-white': '#f5f3ef',
      '--cream': '#e8e4da',
      '--text': '#c8d0dc',
      '--text-muted': '#7a8a9e',
      '--text-bright': '#e8edf4',
      '--border': 'rgba(255,255,255,0.08)'
    }
  },
  light: {
    label: 'Light',
    swatch: '#f5f3ef',
    vars: {
      '--black': '#ffffff',
      '--near-black': '#f5f3ef',
      '--dark-grey': '#eae6df',
      '--charcoal': '#e0dbd3',
      '--mid-grey': '#d4cfc7',
      '--accent': '#b06a2a',
      '--accent-hover': '#964f18',
      '--warm-white': '#1a1a1a',
      '--cream': '#2a2a2a',
      '--text': '#3a3a3a',
      '--text-muted': '#6a6a6a',
      '--text-bright': '#1a1a1a',
      '--border': 'rgba(0,0,0,0.08)'
    }
  },
  slate: {
    label: 'Slate',
    swatch: '#1a2332',
    vars: {
      '--black': '#0f1720',
      '--near-black': '#1a2332',
      '--dark-grey': '#243040',
      '--charcoal': '#2e3c4e',
      '--mid-grey': '#3a4a5e',
      '--accent': '#4a9e8e',
      '--accent-hover': '#3a8878',
      '--warm-white': '#f0f2f5',
      '--cream': '#e0e4ea',
      '--text': '#b8c0cc',
      '--text-muted': '#728098',
      '--text-bright': '#e4e8f0',
      '--border': 'rgba(255,255,255,0.07)'
    }
  },
  ember: {
    label: 'Ember',
    swatch: '#1a1210',
    vars: {
      '--black': '#120c0a',
      '--near-black': '#1a1210',
      '--dark-grey': '#241a16',
      '--charcoal': '#2e221e',
      '--mid-grey': '#3a2e28',
      '--accent': '#c45a3a',
      '--accent-hover': '#a84428',
      '--warm-white': '#f5efe8',
      '--cream': '#e8ddd2',
      '--text': '#d0c4b8',
      '--text-muted': '#8a7e72',
      '--text-bright': '#f0e8de',
      '--border': 'rgba(255,255,255,0.06)'
    }
  }
};

module.exports = themes;
