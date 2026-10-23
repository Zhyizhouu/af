import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { db, openScope, type TaskPageRow, type TaskPropertyRow } from '../../data/db';
import { PageDetail } from './PageDetail';
import { createPage, saveProperty } from './store';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

const noop = () => {};

const mount = (page: TaskPageRow, properties: TaskPropertyRow[] = []) =>
  render(
    <PageDetail
      page={page}
      properties={properties}
      mode="peek"
      onClose={noop}
      onFullscreen={noop}
      onExitFullscreen={noop}
      onChange={noop}
    />,
  );

describe('PageDetail flush on unmount', () => {
  it('saves a typed title when unmounted without a blur', async () => {
    const page = await createPage('Old');
    const view = mount(page);

    fireEvent.change(screen.getByDisplayValue('Old'), { target: { value: 'New title' } });
    view.unmount();

    await expect.poll(async () => (await db().taskPages.get(page.id))?.title).toBe('New title');
  });

  it('saves a typed text property when unmounted without a blur', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    const view = mount(page, [property]);

    fireEvent.change(screen.getByPlaceholderText('Empty'), { target: { value: 'hello' } });
    view.unmount();

    await expect.poll(async () => (await db().taskPages.get(page.id))?.values[property.id]).toBe('hello');
  });

  it('saves an edited note body, sanitised, when unmounted without a blur', async () => {
    const page = await createPage('P');
    const view = mount(page);

    const editor = view.container.querySelector('.tsk__body-editor') as HTMLElement;
    editor.innerHTML = '<p onclick="x()">text</p><script>1</script>';
    fireEvent.input(editor);
    view.unmount();

    await expect.poll(async () => (await db().taskPages.get(page.id))?.body).toBe('<p>text</p>');
  });
});
