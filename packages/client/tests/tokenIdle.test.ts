import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { VESSEL_TOKENS } from '@one-monopoly/shared';

interface AnimationChannel {
  sampler: number;
  target: { node: number; path: string };
}

interface AnimationClip {
  name: string;
  channels: AnimationChannel[];
  samplers: { input: number }[];
}

it('ships a playable Idle clip on every selectable token', async () => {
  for (const token of VESSEL_TOKENS) {
    const file = token.toLowerCase().replaceAll('_', '-') + '.glb';
    const bytes = await readFile(new URL('../public/models/tokens/' + file, import.meta.url));
    // The first chunk of a binary glTF file is its JSON scene description.
    const jsonLength = bytes.readUInt32LE(12);
    const scene = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
    const idle: AnimationClip | undefined = scene.animations?.find((clip: AnimationClip) => clip.name === 'Idle');
    assert.ok(idle?.channels.length, `${token} needs an Idle clip`);
    for (const { sampler, target } of idle.channels) {
      assert.ok(scene.nodes[target.node], `${token} needs an animated node`);
      assert.ok(scene.accessors[idle.samplers[sampler].input].count > 1, `${token} needs multiple keyframes`);
    }
  }
});
