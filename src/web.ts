import { WebPlugin } from '@capacitor/core';

import type { RevnixPlugin } from './definitions';

export class RevnixWeb extends WebPlugin implements RevnixPlugin {
  async echo(options: { value: string }): Promise<{ value: string }> {
    console.log('ECHO', options);
    return options;
  }
}
