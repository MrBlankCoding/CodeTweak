import { beforeEach, describe, expect, it, vi } from 'vitest';

async function importFresh() {
  vi.resetModules();
  return import('../../src/GM/helpers/trusted_types.js');
}

describe('trusted types helper', () => {
  beforeEach(() => {
    delete window.trustedTypes;
  });

  it('returns null when trusted types are unavailable', async () => {
    const { getTrustedTypesPolicy } = await importFresh();
    expect(getTrustedTypesPolicy()).toBeNull();
  });

  it('creates and caches policy', async () => {
    const createPolicy = vi.fn((_name, fns) => fns);
    window.trustedTypes = { createPolicy };

    const { getTrustedTypesPolicy } = await importFresh();
    const policy1 = getTrustedTypesPolicy();
    const policy2 = getTrustedTypesPolicy();

    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(policy1).toBe(policy2);
    expect(policy1.createHTML('<div onclick="x()"><script>x</script>ok</div>')).toBe(
      '<div >ok</div>'
    );
  });

  it('returns null if policy creation throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.trustedTypes = {
      createPolicy: vi.fn(() => {
        throw new Error('boom');
      }),
    };

    const { getTrustedTypesPolicy } = await importFresh();
    expect(getTrustedTypesPolicy()).toBeNull();
    expect(errSpy).toHaveBeenCalled();
  });
});
