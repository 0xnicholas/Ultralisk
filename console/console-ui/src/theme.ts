import { createTheme, DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';

const themeOverride = createTheme({
  primaryColor: 'violet',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  headings: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
  defaultRadius: 'md',
  colors: {
    dark: [
      '#C1C2C5', '#A6A7AB', '#909296', '#5C5F66',
      '#373A40', '#2C2E33', '#25262B', '#1A1B1E',
      '#141517', '#101113',
    ],
  },
});

export const theme = mergeMantineTheme(DEFAULT_THEME, themeOverride);
