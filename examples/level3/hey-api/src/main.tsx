import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { queryClient } from './api/query-client';
import 'ol/ol.css';
import './styles.css';

const theme = createTheme({
  palette: {
    primary: { main: '#176857' },
    text: { primary: '#142924', secondary: '#52665e' },
    background: { default: '#f2f5f1', paper: '#fff' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, "Yu Gothic UI", Meiryo, sans-serif',
    button: { textTransform: 'none', fontWeight: 650 },
  },
  components: {
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiPaper: { defaultProps: { elevation: 0 } },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
