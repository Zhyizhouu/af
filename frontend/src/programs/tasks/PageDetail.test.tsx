import { beforeEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { db, openScope, type TaskPageRow, type TaskPropertyRow } from '../../data/db';
import { PageDetail } from './PageDetail';
import { addOption, createPage, listProperties, savePageValue, saveProperty, seedDefaultProperties } from './store';

beforeEach(async () => {
  await openScope(`test-${Math.random().toString(36).slice(2)}`);
});

const noop = () => {};

const detail = (page: TaskPageRow, properties: TaskPropertyRow[] = []) => (
  <PageDetail
    page={page}
    properties={properties}
    mode="peek"
    onClose={noop}
    onFullscreen={noop}
    onExitFullscreen={noop}
    onChange={noop}
  />
);

const mount = (page: TaskPageRow, properties: TaskPropertyRow[] = []) => render(detail(page, properties));

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));

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

describe('PageDetail status and priority', () => {
  it('keeps the status when its active option is clicked again', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    mount(page, await listProperties());

    fireEvent.click(screen.getByRole('button', { name: 'Not started' }));
    await settle();

    const stored = (await db().taskPages.get(page.id))!;
    expect(stored.values['seed:status']).toBe('seed:status:not-started');
    expect(stored.updatedAt).toBe(page.updatedAt);
  });

  it('keeps the priority when its active option is clicked again', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    mount(page, await listProperties());

    fireEvent.click(screen.getByRole('button', { name: 'Medium' }));
    await settle();

    const stored = (await db().taskPages.get(page.id))!;
    expect(stored.values['seed:priority']).toBe('seed:priority:medium');
    expect(stored.updatedAt).toBe(page.updatedAt);
  });

  it('still changes status to another option', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    mount(page, await listProperties());

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await expect.poll(async () => (await db().taskPages.get(page.id))?.values['seed:status']).toBe('seed:status:done');
  });

  it('still clears another select property when its active option is clicked again', async () => {
    const area = await saveProperty({ name: 'Area', type: 'select' });
    await addOption(area.id, 'Math');
    const withOption = (await listProperties())[0]!;
    const page = await createPage('P');
    await savePageValue(page.id, area.id, withOption.options[0]!.id);
    mount((await db().taskPages.get(page.id))!, [withOption]);

    fireEvent.click(screen.getByRole('button', { name: 'Math' }));

    await expect.poll(async () => (await db().taskPages.get(page.id))?.values[area.id]).toBeNull();
  });
});

describe('PageDetail draft fields', () => {
  it('writes nothing when a text field is focused and blurred without an edit', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    mount(page, [property]);
    const input = screen.getByPlaceholderText('Empty');

    fireEvent.focus(input);
    fireEvent.blur(input);
    await settle();

    expect((await db().taskPages.get(page.id))!.updatedAt).toBe(page.updatedAt);
  });

  it('writes nothing when an edit is typed back to the saved value', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    mount(page, [property]);
    const input = screen.getByPlaceholderText('Empty');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await settle();

    expect((await db().taskPages.get(page.id))!.updatedAt).toBe(page.updatedAt);
  });

  it('commits a real edit on blur', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    mount(page, [property]);
    const input = screen.getByPlaceholderText('Empty');

    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.blur(input);

    await expect.poll(async () => (await db().taskPages.get(page.id))?.values[property.id]).toBe('hello');
  });

  it('re-renders a remote change into an unfocused text field', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    const view = mount(page, [property]);
    expect(screen.getByPlaceholderText('Empty')).toHaveValue('');

    view.rerender(detail({ ...page, values: { [property.id]: 'from elsewhere' } }, [property]));

    expect(screen.getByPlaceholderText('Empty')).toHaveValue('from elsewhere');
  });

  it('keeps a focused, edited field when a remote change arrives', async () => {
    const property = await saveProperty({ name: 'Notes', type: 'text' });
    const page = await createPage('P');
    const view = mount(page, [property]);
    const input = screen.getByPlaceholderText('Empty');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'mine' } });
    view.rerender(detail({ ...page, values: { [property.id]: 'theirs' } }, [property]));

    expect(input).toHaveValue('mine');
  });

  it('re-renders a remote change into an unfocused date field', async () => {
    const property = await saveProperty({ name: 'Due', type: 'date' });
    const page = await createPage('P');
    const view = mount(page, [property]);
    const input = view.container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input.value).toBe('');

    view.rerender(detail({ ...page, values: { [property.id]: Date.UTC(2026, 4, 17) } }, [property]));

    expect(input.value).toBe('2026-05-17');
  });
});

describe('PageBody sync', () => {
  const editorOf = (container: HTMLElement) => container.querySelector('.tsk__body-editor') as HTMLElement;

  it('writes nothing when the editor is focused and blurred without an edit', async () => {
    const page = await createPage('P');
    const view = mount(page);
    const editor = editorOf(view.container);

    fireEvent.focus(editor);
    fireEvent.blur(editor);
    await settle();

    expect((await db().taskPages.get(page.id))!.updatedAt).toBe(page.updatedAt);
  });

  it('saves an edit on blur once and not again on a second blur', async () => {
    const page = await createPage('P');
    const view = mount(page);
    const editor = editorOf(view.container);

    editor.innerHTML = '<p>draft</p>';
    fireEvent.input(editor);
    fireEvent.blur(editor);
    await expect.poll(async () => (await db().taskPages.get(page.id))?.body).toBe('<p>draft</p>');
    const first = (await db().taskPages.get(page.id))!.updatedAt;
    fireEvent.blur(editor);
    await settle();

    expect((await db().taskPages.get(page.id))!.updatedAt).toBe(first);
  });

  it('replaces the content when the body changes remotely while unfocused', async () => {
    const page = await createPage('P');
    const view = mount(page);

    view.rerender(detail({ ...page, body: '<p>synced</p>' }));

    expect(editorOf(view.container).innerHTML).toBe('<p>synced</p>');
  });

  it('keeps focused content and does not overwrite a remote body on a no-edit blur', async () => {
    const page = await createPage('P');
    const view = mount(page);
    const editor = editorOf(view.container);

    fireEvent.focus(editor);
    view.rerender(detail({ ...page, body: '<p>synced</p>' }));
    expect(editor.innerHTML).toBe('');
    fireEvent.blur(editor);
    await settle();

    expect((await db().taskPages.get(page.id))!.updatedAt).toBe(page.updatedAt);
    expect(editor.innerHTML).toBe('<p>synced</p>');
  });
});

describe('PageDetail steps', () => {
  const statusLabel = async (id: string) => {
    const status = (await listProperties()).find((property) => property.type === 'status')!;
    const value = (await db().taskPages.get(id))!.values[status.id];
    return status.options.find((option) => option.id === value)?.label;
  };

  const addStep = async (text: string) => {
    fireEvent.change(screen.getByPlaceholderText('Add a step…'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await screen.findByRole('checkbox', { name: new RegExp(`: ${text}$`) });
  };

  it('invites splitting the task when it has no steps', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    mount(page, await listProperties());

    expect(await screen.findByText('Split this task into steps on different days.')).toBeInTheDocument();
    expect(screen.queryByText(/steps done/)).toBeNull();
  });

  it('adds steps and drives the task status as they are ticked', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    mount(page, await listProperties());

    await addStep('One');
    await addStep('Two');
    expect(await screen.findByText('0 of 2 steps done')).toBeInTheDocument();
    const nodes = screen.getAllByRole('checkbox', { name: /^Step \d: / });
    expect(nodes).toHaveLength(2);
    expect(screen.getByPlaceholderText('Add a step…')).toHaveValue('');

    fireEvent.click(nodes[0]!);
    expect(await screen.findByText('1 of 2 steps done')).toBeInTheDocument();
    await expect.poll(() => statusLabel(page.id)).toBe('In progress');

    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Step \d: / })[1]!);
    expect(await screen.findByText('2 of 2 steps done')).toBeInTheDocument();
    await expect.poll(() => statusLabel(page.id)).toBe('Done');
  });

  it('shows the steps ticked and clears removed ones when the task is set to Done in the detail', async () => {
    await seedDefaultProperties();
    const page = await createPage('P');
    const properties = await listProperties();
    const Live = () => {
      const [current, setCurrent] = useState(page);
      return (
        <PageDetail
          page={current}
          properties={properties}
          mode="peek"
          onClose={noop}
          onFullscreen={noop}
          onExitFullscreen={noop}
          onChange={() => void db().taskPages.get(page.id).then((row) => row && setCurrent(row))}
        />
      );
    };
    render(<Live />);

    await addStep('One');
    await addStep('Two');
    expect(await screen.findByText('0 of 2 steps done')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('2 of 2 steps done')).toBeInTheDocument();
    for (const node of screen.getAllByRole('checkbox', { name: /^Step \d: / })) {
      expect(node).toHaveAttribute('aria-checked', 'true');
    }
  });
});
