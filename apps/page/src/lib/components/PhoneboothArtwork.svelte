<div class="artwork-boundary" aria-hidden="true">
  <picture class="artwork">
    <source
      type="image/webp"
      srcset="/assets/phonebooth-booth-background-320.webp 320w, /assets/phonebooth-booth-background-640.webp 640w"
      sizes="(max-width: 720px) 30vw, 216px"
    />
    <img
      src="/assets/phonebooth-booth-background-320.png"
      srcset="/assets/phonebooth-booth-background-320.png 320w, /assets/phonebooth-booth-background-640.png 640w"
      sizes="(max-width: 720px) 30vw, 216px"
      width="320"
      height="536"
      alt=""
      decoding="async"
      fetchpriority="low"
    />
  </picture>
</div>

<style>
  .artwork-boundary {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: min(calc(100% - var(--space-12)), 1040px);
    margin-inline: auto;
    overflow: hidden;
    pointer-events: none;
  }

  .artwork {
    position: absolute;
    bottom: -24px;
    left: 0;
    display: block;
    width: clamp(156px, 16vw, 216px);
    opacity: 0.24;
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 48%) 22%, #000 54%);
    mask-image: linear-gradient(to bottom, transparent 0%, rgb(0 0 0 / 48%) 22%, #000 54%);
  }

  .artwork img {
    display: block;
    width: 100%;
    height: auto;
  }

  @media (max-width: 720px) {
    .artwork-boundary {
      width: calc(100% - var(--space-8));
    }

    .artwork {
      bottom: -24px;
      width: clamp(112px, 30vw, 144px);
      opacity: 0.17;
    }
  }

  @media (max-width: 520px) and (max-height: 680px) {
    .artwork {
      bottom: -24px;
      width: 96px;
      opacity: 0.13;
    }
  }
</style>
