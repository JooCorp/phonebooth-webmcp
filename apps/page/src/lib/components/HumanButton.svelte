<script lang="ts">
  import { PbButton } from '@phonebooth/design';

  let { label, onclick, disabled = false }: { label: string; onclick: () => void | Promise<unknown>; disabled?: boolean } = $props();
</script>

<PbButton humanOnly {disabled} onclick={() => void onclick()}>{label}</PbButton>
