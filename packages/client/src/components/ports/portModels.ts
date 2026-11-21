import { asiaPorts } from './asia.js';
import { europePorts } from './europe.js';
import { pacificPorts } from './pacific.js';
import { PortBuilder, type PortModel } from './geometry.js';

const quay = new PortBuilder().quay().build('').faces;
export const portModels: Readonly<Record<string, PortModel>> = Object.fromEntries(
  Object.entries({ ...asiaPorts, ...europePorts, ...pacificPorts }).map(([code, model]) =>
    [code, { label: model.label, faces: [...quay, ...model.faces] }]),
);
