<script lang="ts">
  import '@fontsource-variable/open-sans';
  import '@fontsource/ibm-plex-mono/latin-400.css';
  import '@fontsource/ibm-plex-mono/latin-500.css';
  import '@fontsource/ibm-plex-mono/latin-600.css';
  import '@fontsource/merriweather/latin-400.css';
  import '@fontsource/merriweather/latin-400-italic.css';
  import '@fontsource/merriweather/latin-700.css';
  import '@fontsource/merriweather/latin-700-italic.css';
  import '../app.css';

  let { children } = $props();
</script>

{@render children()}
