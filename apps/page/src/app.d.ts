declare global {
  namespace App {}

  namespace svelteHTML {
    interface HTMLAttributes<T> {
      toolname?: string;
      tooldescription?: string;
      toolautosubmit?: boolean | '';
      toolparamdescription?: string;
    }
  }
}

export {};
