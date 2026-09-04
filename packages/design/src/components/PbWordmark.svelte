<script lang="ts">
  let { compact = false }: { compact?: boolean } = $props();
</script>

<div class:compact class="wordmark">
  <span class="wordmark__name"><em>Phone</em>booth</span>
  <a
    class="wordmark__byline"
    href="https://joovoice.com"
    target="_blank"
    rel="noreferrer"
    aria-label="By JooVoice — visit joovoice.com"
  >by JooVoice</a>
</div>

<style>
  .wordmark {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-3);
    color: var(--theme-text);
    user-select: none;
  }

  .wordmark__name {
    font-family: var(--font-display);
    font-size: var(--text-wordmark);
    font-weight: var(--weight-bold);
    line-height: 1;
    letter-spacing: var(--tracking-tight);
  }

  .wordmark__name em {
    color: var(--theme-brand);
    font-weight: inherit;
  }

  .wordmark__byline {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    flex: 0 0 auto;
    border-bottom: 1px solid transparent;
    color: var(--theme-text-subtle);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: var(--weight-semibold);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color 140ms ease, border-color 140ms ease;
  }

  .wordmark__byline:hover {
    border-color: var(--theme-border-focus);
    color: var(--theme-text-link);
  }

  .wordmark__byline:focus-visible {
    border-color: var(--theme-border-focus);
    border-radius: var(--radius-xs);
    outline: none;
    box-shadow: var(--theme-focus-ring);
  }

  .wordmark.compact .wordmark__name {
    font-size: var(--text-xl);
  }

  .wordmark.compact .wordmark__byline {
    font-size: var(--text-2xs);
  }

  @media (max-width: 720px) {
    .wordmark__name {
      font-size: var(--text-wordmark-md);
    }

    .wordmark__byline {
      min-height: 44px;
      font-size: var(--text-2xs);
    }
  }

  @media (max-width: 380px) {
    .wordmark {
      gap: var(--space-2);
    }

    .wordmark__name {
      font-size: var(--text-wordmark-sm);
    }
  }
</style>
