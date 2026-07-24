(function () {
    'use strict';

    // After an "Add section" click we reload the page and then scroll to the
    // newly-added section. Browser scroll restoration would otherwise snap
    // back to the previous scroll position just after our scroll fires.
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const pageSlug = document.querySelector('meta[name="page-slug"]')?.content || 'main';
    const pageHidden = document.querySelector('meta[name="page-hidden"]')?.content === 'true';
    let allPagesList = [];
    try {
        allPagesList = JSON.parse(document.querySelector('meta[name="all-pages"]')?.content || '[]');
    } catch (err) { /* leave empty */ }

    // Section field labels for readable modal fields
    const fieldLabels = {
        'hero.heading': 'Heading',
        'hero.subtext': 'Subtext',
        'hero.cta': 'Button text',
        'hero.whatsapp': 'WhatsApp link (leave empty to hide the WhatsApp button)',
        'credentials_oxford.title': 'Title',
        'credentials_oxford.text': 'Description',
        'credentials_stat.stat': 'Statistic',
        'credentials_stat.text': 'Statistic description',
        'biography.label': 'Section label',
        'biography.heading': 'Heading',
        'biography.col_1_p1': 'Left column, paragraph 1',
        'biography.col_1_p2': 'Left column, paragraph 2',
        'biography.col_2_p1': 'Right column, paragraph 1',
        'biography.col_2_p2': 'Right column, paragraph 2',
        'intervention.heading': 'Heading',
        'intervention.subtext': 'Body text',
        'intervention.button_text': 'Button text (leave empty to hide button)',
        'intervention.button_link': 'Button links to',
        'approach.label': 'Section label',
        'approach.heading': 'Heading',
        'approach.step_1_title': 'Step 1 title',
        'approach.step_1_body': 'Step 1 body',
        'approach.step_2_title': 'Step 2 title',
        'approach.step_2_body': 'Step 2 body',
        'approach.step_3_title': 'Step 3 title',
        'approach.step_3_body': 'Step 3 body',
        'insights.label': 'Section label',
        'insights.heading': 'Heading',
        'insights.subtext': 'Subtext',
        'insights.card_1_tag': 'Card 1 tag',
        'insights.card_1_title': 'Card 1 title',
        'insights.card_1_body': 'Card 1 body',
        'insights.card_2_tag': 'Card 2 tag',
        'insights.card_2_title': 'Card 2 title',
        'insights.card_2_body': 'Card 2 body',
        'insights.card_3_tag': 'Card 3 tag',
        'insights.card_3_title': 'Card 3 title',
        'insights.card_3_body': 'Card 3 body',
        'fourcards.label': 'Section label',
        'fourcards.heading': 'Heading',
        'fourcards.card_1_number': 'Card 1 number',
        'fourcards.card_1_title': 'Card 1 title',
        'fourcards.card_1_body': 'Card 1 body',
        'fourcards.card_2_number': 'Card 2 number',
        'fourcards.card_2_title': 'Card 2 title',
        'fourcards.card_2_body': 'Card 2 body',
        'fourcards.card_3_number': 'Card 3 number',
        'fourcards.card_3_title': 'Card 3 title',
        'fourcards.card_3_body': 'Card 3 body',
        'fourcards.card_4_number': 'Card 4 number',
        'fourcards.card_4_title': 'Card 4 title',
        'fourcards.card_4_body': 'Card 4 body',
        'documents.label': 'Section label (leave empty to hide)',
        'documents.heading': 'Heading',
        'documents.intro': 'Introduction',
        'documents.doc_1_title': 'Document 1 title',
        'documents.doc_1_blurb': 'Document 1 description',
        'documents.doc_1_meta': 'Document 1 detail line (e.g. PDF, 4 pages)',
        'documents.doc_1_file': 'Document 1 PDF filename (must exist in private/pdfs/, e.g. /pdfs/example.pdf)',
        'documents.doc_1_image': 'Document 1 preview image path',
        'documents.doc_2_title': 'Document 2 title',
        'documents.doc_2_blurb': 'Document 2 description',
        'documents.doc_2_meta': 'Document 2 detail line (e.g. PDF, 4 pages)',
        'documents.doc_2_file': 'Document 2 PDF filename (must exist in private/pdfs/, e.g. /pdfs/example.pdf)',
        'documents.doc_2_image': 'Document 2 preview image path',
        'documents.doc_3_title': 'Document 3 title',
        'documents.doc_3_blurb': 'Document 3 description',
        'documents.doc_3_meta': 'Document 3 detail line (e.g. PDF, 4 pages)',
        'documents.doc_3_file': 'Document 3 PDF filename (must exist in private/pdfs/, e.g. /pdfs/example.pdf)',
        'documents.doc_3_image': 'Document 3 preview image path',
        'documents.doc_4_title': 'Document 4 title',
        'documents.doc_4_blurb': 'Document 4 description',
        'documents.doc_4_meta': 'Document 4 detail line (e.g. PDF, 4 pages)',
        'documents.doc_4_file': 'Document 4 PDF filename (must exist in private/pdfs/, e.g. /pdfs/example.pdf)',
        'documents.doc_4_image': 'Document 4 preview image path',
        'casestudy.label': 'Section label',
        'casestudy.heading': 'Heading',
        'casestudy.subtext': 'Subtext',
        'casestudy.phase_1_label': 'Phase 1 label',
        'casestudy.phase_1_body': 'Phase 1 body',
        'casestudy.phase_2_label': 'Phase 2 label',
        'casestudy.phase_2_body': 'Phase 2 body',
        'casestudy.phase_3_label': 'Phase 3 label',
        'casestudy.phase_3_body': 'Phase 3 body',
        'casestudy2.label': 'Section label',
        'casestudy2.heading': 'Heading',
        'casestudy2.intro': 'Introduction',
        'casestudy2.body': 'Body text',
        'casestudy2.outcome': 'Outcome',
        'assessment.label': 'Section label',
        'assessment.heading': 'Heading',
        'assessment.intro': 'Introduction',
        'assessment.q_1': 'Question 1',
        'assessment.q_2': 'Question 2',
        'assessment.q_3': 'Question 3',
        'assessment.q_4': 'Question 4',
        'assessment.q_5': 'Question 5',
        'assessment.q_6': 'Question 6',
        'filter.label': 'Section label',
        'filter.heading': 'Heading',
        'filter.p1': 'Paragraph 1',
        'filter.p2': 'Paragraph 2',
        'filter.button_text': 'Button text (leave empty to hide button)',
        'filter.button_link': 'Button links to',
        'proofstrip.label': 'Section label (leave empty to hide)',
        'proofstrip.row_1_action': 'Row 1 action',
        'proofstrip.row_1_client': 'Row 1 client',
        'proofstrip.row_2_action': 'Row 2 action',
        'proofstrip.row_2_client': 'Row 2 client',
        'proofstrip.row_3_action': 'Row 3 action',
        'proofstrip.row_3_client': 'Row 3 client',
        'contact.label': 'Section label',
        'contact.heading': 'Heading',
        'contact.body': 'Body text',
        'contact.email': 'Email address',
        'contact.phone': 'Phone number',
        'contact.whatsapp': 'WhatsApp link (leave empty to hide the WhatsApp button)',
        'footer.name': 'Name'
    };

    const sectionTitles = {
        hero: 'Hero',
        credentials_oxford: 'Oxford Credential',
        credentials_stat: 'Revenue Statistic',
        biography: 'Biography',
        intervention: 'Intervention',
        approach: 'Approach',
        insights: 'Insights',
        fourcards: 'Four cards',
        documents: 'Documents',
        casestudy: 'Case Study',
        casestudy2: 'Case Study: Tristan',
        assessment: 'Assessment',
        filter: 'Filter',
        proofstrip: 'Proof strip',
        contact: 'Contact',
        footer: 'Footer'
    };

    // Determine textarea height class based on expected content length
    function heightClass(key) {
        if (key.includes('label') || key.includes('tag') || key.includes('stat') ||
            key.includes('cta') || key.includes('email') || key.includes('phone') ||
            key.includes('_title') || key.includes('_number') ||
            key.includes('_action') || key.includes('_client') ||
            key.includes('_file') || key.includes('_image') || key.includes('_meta') ||
            key.includes('button_text') || key.includes('button_link')) {
            return 'short';
        }
        if (key.includes('body') || key.includes('_p1') || key.includes('_p2') ||
            key.includes('subtext') || key.includes('intro')) {
            return 'tall';
        }
        return '';
    }

    // ---- EDIT MODAL ----
    const modal = document.getElementById('cmsModal');
    const modalTitle = document.getElementById('cmsModalTitle');
    const modalFields = document.getElementById('cmsModalFields');
    const saveBtn = document.getElementById('cmsModalSaveBtn');
    const closeBtn = document.getElementById('cmsModalClose');
    const cancelBtn = document.getElementById('cmsModalCancelBtn');

    let currentSection = null;

    // Instance IDs of the form `{template}__N` carry an extra suffix that
    // fieldLabels and sectionTitles don't know about. Strip the suffix before
    // lookup so duplicates share their template's labels.
    function normalizeKey(key) {
        return key.replace(/__\d+/, '');
    }

    async function openModal(section) {
        currentSection = section;
        const titleKey = normalizeKey(section);
        modalTitle.textContent = 'Edit: ' + (sectionTitles[titleKey] || titleKey);
        modalFields.innerHTML = '<p class="cms-modal-loading">Loading...</p>';
        modal.classList.add('active');

        try {
            const res = await fetch(`/api/content/${section}`, {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();

            modalFields.innerHTML = '';
            const keys = Object.keys(data.fields).sort();
            for (const key of keys) {
                const div = document.createElement('div');
                div.className = 'cms-field';

                const label = document.createElement('label');
                label.className = 'cms-field-label';
                label.textContent = fieldLabels[normalizeKey(key)] || key.split('.').pop().replace(/_/g, ' ');
                div.appendChild(label);

                if (key.endsWith('.button_link')) {
                    const select = document.createElement('select');
                    select.className = 'cms-field-select';
                    select.dataset.key = key;
                    const current = data.fields[key] || '';
                    // An empty value means "scroll to the contact block in the
                    // footer" (what the render path falls back to). Offer it
                    // explicitly so it can be chosen, not just inherited.
                    const contactOpt = document.createElement('option');
                    contactOpt.value = '';
                    contactOpt.textContent = 'Contact section (footer)';
                    if (current === '') contactOpt.selected = true;
                    select.appendChild(contactOpt);
                    for (const p of allPagesList) {
                        const opt = document.createElement('option');
                        opt.value = p.slug;
                        opt.textContent = p.title;
                        if (p.slug === current) opt.selected = true;
                        select.appendChild(opt);
                    }
                    div.appendChild(select);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.className = heightClass(key);
                    textarea.dataset.key = key;
                    textarea.value = data.fields[key];
                    div.appendChild(textarea);

                    // Hint for fields that might contain HTML
                    if (data.fields[key].includes('<strong>') || key.includes('body') || key.includes('_p')) {
                        const hint = document.createElement('div');
                        hint.className = 'cms-field-hint';
                        hint.textContent = 'You may use <strong> for bold text.';
                        div.appendChild(hint);
                    }
                }

                modalFields.appendChild(div);
            }
        } catch (err) {
            modalFields.innerHTML = '<p class="cms-modal-error">Failed to load content. Please try again.</p>';
        }
    }

    function closeModal() {
        modal.classList.remove('active');
        currentSection = null;
    }

    async function saveContent() {
        const inputs = modalFields.querySelectorAll('textarea, select');
        const fields = [];
        inputs.forEach(el => {
            fields.push({ key: el.dataset.key, content: el.value });
        });

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const res = await fetch('/api/content', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ fields })
            });

            if (!res.ok) throw new Error('Save failed');

            // Reload to show updated content
            window.location.reload();
        } catch (err) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save changes';
            alert('Failed to save. Please try again.');
        }
    }

    // Edit button click handlers
    document.querySelectorAll('.cms-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openModal(btn.dataset.section);
        });
    });

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    saveBtn.addEventListener('click', saveContent);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });

    // ---- SECTION REORDER ----
    const sectionsContainer = document.getElementById('cms-sections');

    function updateMoveButtons() {
        const sections = sectionsContainer.querySelectorAll('section[data-section-id]');
        const sectionsList = Array.from(sections);
        document.querySelectorAll('.cms-move-up, .cms-move-down').forEach(btn => {
            const sectionId = btn.dataset.sectionId;
            const section = document.querySelector(`section[data-section-id="${sectionId}"]`);
            const index = sectionsList.indexOf(section);
            if (btn.classList.contains('cms-move-up')) {
                btn.disabled = (index === 0);
            } else {
                btn.disabled = (index === sectionsList.length - 1);
            }
        });
    }

    function getOrderFromDom() {
        return Array.from(sectionsContainer.querySelectorAll('section[data-section-id]'))
            .map(s => s.dataset.sectionId);
    }

    async function saveOrder(order) {
        try {
            const res = await fetch('/api/content/order', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ order, pageSlug })
            });
            if (!res.ok) throw new Error('Save failed');
        } catch (err) {
            alert('Failed to save section order. Please try again.');
        }
    }

    function scrollToSection(section) {
        const navHeight = document.getElementById('nav').offsetHeight;
        const top = section.getBoundingClientRect().top + window.scrollY - navHeight - 16;
        window.scrollTo({ top, behavior: 'instant' });
    }

    document.querySelectorAll('.cms-move-up').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const section = document.querySelector(`section[data-section-id="${btn.dataset.sectionId}"]`);
            const prev = section.previousElementSibling;
            if (prev && prev.matches('section[data-section-id]')) {
                sectionsContainer.insertBefore(section, prev);
                updateMoveButtons();
                scrollToSection(section);
                await saveOrder(getOrderFromDom());
            }
        });
    });

    document.querySelectorAll('.cms-move-down').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const section = document.querySelector(`section[data-section-id="${btn.dataset.sectionId}"]`);
            const next = section.nextElementSibling;
            if (next && next.matches('section[data-section-id]')) {
                sectionsContainer.insertBefore(next, section);
                updateMoveButtons();
                scrollToSection(section);
                await saveOrder(getOrderFromDom());
            }
        });
    });

    updateMoveButtons();

    // ---- HIDE / SHOW SECTION ----
    async function setHidden(sectionId, hidden) {
        try {
            const res = await fetch('/api/content/visibility', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ sectionId, hidden, pageSlug })
            });
            if (!res.ok) throw new Error('Visibility update failed');
            return true;
        } catch (err) {
            alert('Failed to update section visibility. Please try again.');
            return false;
        }
    }

    document.querySelectorAll('.cms-hide-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sectionId = btn.dataset.sectionId;
            const section = document.querySelector(`section[data-section-id="${sectionId}"]`);
            if (!section) return;
            const willHide = !section.classList.contains('cms-section-hidden');
            const ok = await setHidden(sectionId, willHide);
            if (!ok) return;
            section.classList.toggle('cms-section-hidden', willHide);
            // Update all hide buttons for this section id (credentials has one,
            // but this keeps things robust if we ever add more).
            document.querySelectorAll(`.cms-hide-btn[data-section-id="${sectionId}"]`).forEach(b => {
                b.classList.toggle('cms-hide-btn-on', willHide);
                b.title = willHide ? 'Show section' : 'Hide section';
            });
        });
    });

    // ---- DELETE SECTION ----
    document.querySelectorAll('.cms-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const sectionId = btn.dataset.sectionId;
            const confirmed = window.confirm(
                `Delete the "${sectionId}" section from this page?\n\n` +
                `It will be removed from this page only. The content stays in the database and can be restored via "Reset to defaults" or by re-adding the section.`
            );
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/content/section/${encodeURIComponent(sectionId)}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ pageSlug })
                });
                if (!res.ok) throw new Error('Delete failed');
                const section = document.querySelector(`section[data-section-id="${sectionId}"]`);
                if (section) section.remove();
                updateMoveButtons();
            } catch (err) {
                alert('Failed to delete section. Please try again.');
            }
        });
    });

    // ---- ADD SECTION ----
    const addSectionBtn = document.getElementById('cmsAddSectionBtn');
    const addSectionModal = document.getElementById('cmsAddSectionModal');
    const addSectionClose = document.getElementById('cmsAddSectionClose');
    const templateGrid = document.getElementById('cmsTemplateGrid');
    const orphanGrid = document.getElementById('cmsOrphanGrid');
    const tabNew = document.getElementById('cmsTabNew');
    const tabReuse = document.getElementById('cmsTabReuse');

    const templateLabels = {
        hero: 'Hero', credentials: 'Credentials', biography: 'Biography',
        intervention: 'Intervention', approach: 'Approach', insights: 'Insights',
        casestudy: 'Case Study (timeline)', casestudy2: 'Case Study (editorial)',
        assessment: 'Assessment', filter: 'Filter', contact: 'Contact'
    };

    let orphansLoaded = false;

    function openAddSectionModal() {
        addSectionModal.classList.add('active');
        adminPanel?.classList.remove('active');
    }

    function closeAddSectionModal() {
        addSectionModal.classList.remove('active');
    }

    // Tab switching
    document.querySelectorAll('.cms-add-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cms-add-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            if (target === 'new') {
                tabNew.classList.remove('cms-hidden');
                tabReuse.classList.add('cms-hidden');
            } else {
                tabNew.classList.add('cms-hidden');
                tabReuse.classList.remove('cms-hidden');
                if (!orphansLoaded) loadOrphans();
            }
        });
    });

    async function deleteOrphan(instanceId, cardEl) {
        try {
            const r = await fetch(`/api/content/orphaned-section/${encodeURIComponent(instanceId)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                }
            });
            if (!r.ok) throw new Error('Delete failed');
            cardEl.remove();
            // If no cards left, show the empty message
            if (!orphanGrid.querySelector('.cms-orphan-card')) {
                orphanGrid.innerHTML = '<p class="cms-add-empty">No removed sections to reuse. Sections you remove from pages will appear here.</p>';
                const clearBtn = document.getElementById('cmsClearOrphansBtn');
                if (clearBtn) clearBtn.remove();
            }
        } catch (err) {
            alert('Failed to delete. Please try again.');
        }
    }

    function buildOrphanCard(o) {
        const card = document.createElement('div');
        card.className = 'cms-template-card cms-orphan-card';
        card.dataset.instanceId = o.instanceId;
        const label = templateLabels[o.template] || o.template;
        const suffix = o.instanceId !== o.template ? ` (${o.instanceId})` : '';

        const reuseBtn = document.createElement('button');
        reuseBtn.className = 'cms-orphan-reuse';
        reuseBtn.textContent = 'Add to page';
        reuseBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            reuseBtn.disabled = true;
            reuseBtn.textContent = 'Adding...';
            try {
                const r = await fetch('/api/content/section-reuse', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ instanceId: o.instanceId, pageSlug })
                });
                if (!r.ok) throw new Error('Reuse failed');
                try { sessionStorage.setItem('cmsJustAdded', o.instanceId); } catch (err) {}
                window.location.reload();
            } catch (err) {
                reuseBtn.disabled = false;
                reuseBtn.textContent = 'Add to page';
                alert('Failed to reuse section. Please try again.');
            }
        });

        const removeBtn = document.createElement('button');
        removeBtn.className = 'cms-orphan-remove';
        removeBtn.title = 'Delete permanently';
        removeBtn.textContent = '\u00d7';
        removeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Permanently delete "${label}${suffix}"? This cannot be undone.`)) return;
            removeBtn.disabled = true;
            await deleteOrphan(o.instanceId, card);
        });

        card.innerHTML =
            `<div class="cms-template-label">${label}${suffix}</div>` +
            `<div class="cms-template-blurb">${o.preview || 'No preview available'}</div>`;
        const actions = document.createElement('div');
        actions.className = 'cms-orphan-actions';
        actions.appendChild(reuseBtn);
        actions.appendChild(removeBtn);
        card.appendChild(actions);
        return card;
    }

    async function loadOrphans() {
        orphansLoaded = true;
        orphanGrid.innerHTML = '<p class="cms-add-empty">Loading...</p>';
        try {
            const res = await fetch('/api/content/orphaned-sections', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (!data.orphans || data.orphans.length === 0) {
                orphanGrid.innerHTML = '<p class="cms-add-empty">No removed sections to reuse. Sections you remove from pages will appear here.</p>';
                return;
            }
            orphanGrid.innerHTML = '';

            // Clear all button
            const clearBtn = document.createElement('button');
            clearBtn.className = 'cms-orphan-clear';
            clearBtn.id = 'cmsClearOrphansBtn';
            clearBtn.textContent = 'Delete all unused sections';
            clearBtn.addEventListener('click', async () => {
                if (!confirm(`Permanently delete all ${data.orphans.length} unused sections? This cannot be undone.`)) return;
                clearBtn.disabled = true;
                clearBtn.textContent = 'Deleting...';
                for (const o of data.orphans) {
                    try {
                        await fetch(`/api/content/orphaned-section/${encodeURIComponent(o.instanceId)}`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }
                        });
                    } catch (err) { /* continue */ }
                }
                orphanGrid.innerHTML = '<p class="cms-add-empty">No removed sections to reuse. Sections you remove from pages will appear here.</p>';
                clearBtn.remove();
            });
            orphanGrid.parentElement.insertBefore(clearBtn, orphanGrid);

            for (const o of data.orphans) {
                orphanGrid.appendChild(buildOrphanCard(o));
            }
        } catch (err) {
            orphanGrid.innerHTML = '<p class="cms-add-empty">Failed to load sections.</p>';
        }
    }

    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', openAddSectionModal);
    }
    if (addSectionClose) {
        addSectionClose.addEventListener('click', closeAddSectionModal);
    }
    if (addSectionModal) {
        addSectionModal.addEventListener('click', (e) => {
            if (e.target === addSectionModal) closeAddSectionModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && addSectionModal?.classList.contains('active')) {
            closeAddSectionModal();
        }
    });

    if (templateGrid) {
        templateGrid.querySelectorAll('.cms-template-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (card.disabled) return;
                const templateId = card.dataset.templateId;
                card.disabled = true;
                try {
                    const res = await fetch(`/api/content/section/${encodeURIComponent(templateId)}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify({ pageSlug })
                    });
                    if (!res.ok) throw new Error('Add failed');
                    const data = await res.json().catch(() => ({}));
                    const instanceId = data.instanceId || templateId;
                    try { sessionStorage.setItem('cmsJustAdded', instanceId); } catch (err) {}
                    window.location.reload();
                } catch (err) {
                    card.disabled = false;
                    alert('Failed to add section. Please try again.');
                }
            });
        });
    }

    // After a reload triggered by "Add section", scroll to and highlight it.
    try {
        const justAdded = sessionStorage.getItem('cmsJustAdded');
        if (justAdded) {
            sessionStorage.removeItem('cmsJustAdded');
            const target = document.querySelector(`section[data-section-id="${justAdded}"]`);
            if (target) {
                // Defer slightly so layout and fonts have settled.
                setTimeout(() => {
                    scrollToSection(target);
                    target.classList.add('cms-section-just-added');
                    setTimeout(() => target.classList.remove('cms-section-just-added'), 1500);
                }, 80);
            }
        }
    } catch (err) { /* sessionStorage may be disabled */ }

    // ---- ADMIN PANEL ----
    const adminToggle = document.getElementById('cmsAdminToggle');
    const adminPanel = document.getElementById('cmsAdminPanel');
    const panelMenu = document.getElementById('cmsPanelMenu');
    const panelDetail = document.getElementById('cmsPanelDetail');
    const detailBack = document.getElementById('cmsDetailBack');
    const logEntries = document.getElementById('cmsLogEntries');
    const cspEntries = document.getElementById('cmsCspEntries');
    const resetBtn = document.getElementById('cmsResetBtn');
    const confirmOverlay = document.getElementById('cmsConfirm');
    const confirmCancel = document.getElementById('cmsConfirmCancel');
    const confirmReset = document.getElementById('cmsConfirmReset');

    if (adminToggle) {
        adminToggle.addEventListener('click', () => {
            adminPanel.classList.toggle('active');
        });
    }

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (adminPanel && !adminPanel.contains(e.target) && e.target !== adminToggle) {
            adminPanel.classList.remove('active');
        }
    });

    // Collapsible section toggles
    document.querySelectorAll('.cms-section-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const targetId = toggle.dataset.section;
            const body = document.getElementById(targetId);
            if (!body) return;
            const isHidden = body.classList.toggle('cms-hidden');
            toggle.classList.toggle('open', !isHidden);
        });
    });

    // Detail view open/close system
    const detailLoaders = {};

    function openDetail(paneId) {
        if (!panelMenu || !panelDetail) return;
        // Hide all detail panes, show the target one
        document.querySelectorAll('.cms-detail-pane').forEach(p => p.classList.add('cms-hidden'));
        const pane = document.getElementById(paneId);
        if (pane) pane.classList.remove('cms-hidden');
        panelMenu.classList.add('cms-hidden');
        panelDetail.classList.remove('cms-hidden');
        // Trigger data loader if registered
        if (detailLoaders[paneId]) detailLoaders[paneId]();
    }

    function closeDetail() {
        if (!panelMenu || !panelDetail) return;
        panelDetail.classList.add('cms-hidden');
        panelMenu.classList.remove('cms-hidden');
    }

    if (detailBack) {
        detailBack.addEventListener('click', closeDetail);
    }

    // Wire up all detail triggers
    document.querySelectorAll('.cms-detail-trigger').forEach(btn => {
        btn.addEventListener('click', () => {
            const paneId = btn.dataset.detail;
            if (paneId) openDetail(paneId);
        });
    });

    // Activity log loader
    detailLoaders['cmsLogDetail'] = async () => {
        if (!logEntries) return;
        logEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const res = await fetch('/api/admin/log', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (data.log.length === 0) {
                logEntries.innerHTML = '<span class="cms-log-empty">No activity yet.</span>';
                return;
            }
            logEntries.innerHTML = data.log.map(entry => {
                const date = new Date(entry.created_at);
                const timeStr = date.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                const action = entry.action.replace(/_/g, ' ');
                const section = entry.section_key ? ` (${entry.section_key})` : '';
                return `<div class="cms-log-entry">
                    <span class="log-user">${entry.username}</span>
                    <span class="log-action">${action}${section}</span><br>
                    <span class="log-time">${timeStr}</span>
                </div>`;
            }).join('');
        } catch (err) {
            logEntries.innerHTML = '<span class="cms-log-error">Failed to load log.</span>';
        }
    };

    // Leads & bookings loader. Unlike the activity log above, this data is
    // raw visitor input (name/email/phone/message), so every field is passed
    // through escapeHtml before it reaches innerHTML.
    const leadsEntries = document.getElementById('cmsLeadsEntries');
    detailLoaders['cmsLeadsDetail'] = async () => {
        if (!leadsEntries) return;
        leadsEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const res = await fetch('/api/admin/leads', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (!data.leads || data.leads.length === 0) {
                leadsEntries.innerHTML = '<span class="cms-log-empty">No leads yet.</span>';
                return;
            }
            leadsEntries.innerHTML = data.leads.map(lead => {
                const date = new Date(lead.created_at);
                const timeStr = date.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                const kindLabel = lead.kind === 'pdf_download' ? 'PDF download'
                    : lead.kind === 'quiz_results' ? 'Dependency review'
                    : 'Contact / booking';
                const parts = [`<span class="log-action">${escapeHtml(kindLabel)}</span><br>`];
                if (lead.name) parts.push(`<strong>${escapeHtml(lead.name)}</strong> `);
                parts.push(`${escapeHtml(lead.email)}<br>`);
                if (lead.phone) parts.push(`${escapeHtml(lead.phone)}<br>`);
                if (lead.preferred_time) parts.push(`Preferred time: ${escapeHtml(lead.preferred_time)}<br>`);
                if (lead.document) parts.push(`Document: ${escapeHtml(lead.document)}<br>`);
                if (lead.message) parts.push(`"${escapeHtml(lead.message)}"<br>`);
                parts.push(`<span class="log-time">${timeStr}</span>`);
                return `<div class="cms-log-entry">${parts.join('')}</div>`;
            }).join('');
        } catch (err) {
            leadsEntries.innerHTML = '<span class="cms-log-error">Failed to load leads.</span>';
        }
    };

    // ---- CSP VIOLATIONS (admin only) ----
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // CSP violations loader
    detailLoaders['cmsCspDetail'] = () => {
        if (!cspEntries) return;
        const violations = window.__cspViolations || [];
        if (violations.length === 0) {
            cspEntries.innerHTML = '<span class="cms-log-empty">No CSP violations on this page. Reload to refresh.</span>';
            return;
        }
        cspEntries.innerHTML = violations.map(v => {
            const where = v.source ? `${escapeHtml(v.source)}:${v.line}` : '';
            return `<div class="cms-log-entry">
                <span class="log-action">${escapeHtml(v.directive)}</span><br>
                <span class="log-time">blocked: ${escapeHtml(v.blocked)}${where ? ' — ' + where : ''}</span>
            </div>`;
        }).join('');
    };

    // ---- USER MANAGEMENT ----
    const usersEntries = document.getElementById('cmsUsersEntries');
    const addUserBtn = document.getElementById('cmsAddUserBtn');

    async function loadUsers() {
        usersEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (!data.users || data.users.length === 0) {
                usersEntries.innerHTML = '<span class="cms-log-empty">No users.</span>';
                return;
            }
            usersEntries.innerHTML = data.users.map(u => {
                const date = new Date(u.created_at);
                const timeStr = date.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric'
                });
                return `<div class="cms-log-entry cms-user-entry" data-user-id="${u.id}">
                    <div class="cms-user-info">
                        <span class="log-user">${escapeHtml(u.username)}</span>
                        <span class="cms-admin-role">${u.role}</span><br>
                        <span class="log-time">Created ${timeStr}</span>
                    </div>
                    <div class="cms-user-btns">
                        <button class="cms-user-pw-btn" data-id="${u.id}" data-name="${escapeHtml(u.username)}" title="Change password">&#128273;</button>
                        <button class="cms-user-del-btn" data-id="${u.id}" data-name="${escapeHtml(u.username)}" title="Delete user">&#10005;</button>
                    </div>
                </div>`;
            }).join('');

            // Password change handlers
            usersEntries.querySelectorAll('.cms-user-pw-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const newPw = prompt(`New password for "${btn.dataset.name}" (min 6 characters):`);
                    if (!newPw || newPw.length < 6) {
                        if (newPw !== null) alert('Password must be at least 6 characters.');
                        return;
                    }
                    try {
                        const r = await fetch(`/api/admin/user/${btn.dataset.id}/password`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': csrfToken
                            },
                            body: JSON.stringify({ password: newPw })
                        });
                        if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
                        alert(`Password changed for "${btn.dataset.name}".`);
                    } catch (err) {
                        alert(err.message || 'Failed to change password.');
                    }
                });
            });

            // Delete user handlers
            usersEntries.querySelectorAll('.cms-user-del-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (!confirm(`Delete user "${btn.dataset.name}"? This cannot be undone.`)) return;
                    try {
                        const r = await fetch(`/api/admin/user/${btn.dataset.id}`, {
                            method: 'DELETE',
                            headers: {
                                'Content-Type': 'application/json',
                                'X-CSRF-Token': csrfToken
                            }
                        });
                        if (!r.ok) { const d = await r.json(); throw new Error(d.error); }
                        loadUsers();
                    } catch (err) {
                        alert(err.message || 'Failed to delete user.');
                    }
                });
            });
        } catch (err) {
            usersEntries.innerHTML = '<span class="cms-log-error">Failed to load users.</span>';
        }
    }

    detailLoaders['cmsUsersDetail'] = () => loadUsers();

    if (addUserBtn) {
        addUserBtn.addEventListener('click', async () => {
            const username = document.getElementById('cmsNewUsername').value.trim();
            const password = document.getElementById('cmsNewPassword').value;
            const role = document.getElementById('cmsNewRole').value;

            if (!username || username.length < 2) {
                alert('Username must be at least 2 characters.');
                return;
            }
            if (!password || password.length < 6) {
                alert('Password must be at least 6 characters.');
                return;
            }

            addUserBtn.disabled = true;
            addUserBtn.textContent = 'Adding...';
            try {
                const r = await fetch('/api/admin/user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ username, password, role })
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                document.getElementById('cmsNewUsername').value = '';
                document.getElementById('cmsNewPassword').value = '';
                document.getElementById('cmsNewRole').selectedIndex = 0;
                loadUsers();
            } catch (err) {
                alert(err.message || 'Failed to add user.');
            }
            addUserBtn.disabled = false;
            addUserBtn.textContent = 'Add user';
        });
    }

    // ---- IMAGE UPLOAD ----
    const imageInput = document.createElement('input');
    imageInput.type = 'file';
    imageInput.id = 'cmsImageInput';
    imageInput.accept = 'image/png,image/jpeg,image/webp,image/avif,image/gif';
    document.body.appendChild(imageInput);

    let currentImageKey = null;

    // Expected aspect ratios (width/height) with 10% tolerance
    const expectedRatios = {
        logo: 511 / 243,     // ~2.1:1 landscape
        headshot: 3 / 4,     // 0.75 portrait
        oxford: 900 / 677    // ~1.33:1 landscape
    };

    // Image keys can be base (`headshot`) or instance-scoped (`headshot__hero__2`).
    // The base prefix determines the expected ratio for either form.
    function imageBaseKey(key) {
        const i = key.indexOf('__');
        return i > 0 ? key.slice(0, i) : key;
    }

    function checkAspectRatio(width, height, key) {
        const expected = expectedRatios[imageBaseKey(key)];
        if (!expected) return true;
        const actual = width / height;
        const tolerance = 0.1;
        const ratio = actual / expected;
        return ratio >= (1 - tolerance) && ratio <= (1 + tolerance);
    }

    document.querySelectorAll('.cms-img-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            currentImageKey = btn.dataset.image;
            imageInput.click();
        });
    });

    imageInput.addEventListener('change', async () => {
        const file = imageInput.files[0];
        if (!file || !currentImageKey) return;

        if (file.size > 2 * 1024 * 1024) {
            alert('Image too large. Maximum size is 2MB.');
            imageInput.value = '';
            return;
        }

        // Read file as base64 first (before clearing input)
        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result.split(',')[1];

            // Check aspect ratio via Image element
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);

            const upload = async () => {
                try {
                    const res = await fetch(`/api/content/image/${currentImageKey}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': csrfToken
                        },
                        body: JSON.stringify({ data: base64, mimeType: file.type })
                    });
                    if (!res.ok) throw new Error('Upload failed');
                    window.location.reload();
                } catch (err) {
                    alert('Failed to upload image. Please try again.');
                }
            };

            img.onload = async () => {
                URL.revokeObjectURL(objectUrl);
                if (!checkAspectRatio(img.width, img.height, currentImageKey)) {
                    const ratioLabels = { headshot: '3:4 portrait', logo: '2:1 landscape', oxford: '4:3 landscape' };
                    const base = imageBaseKey(currentImageKey);
                    const ratioLabel = ratioLabels[base] || 'the same as the original';
                    alert(`This image has the wrong aspect ratio. The ${base} needs to be approximately ${ratioLabel}. Please crop or resize your image and try again.`);
                    return;
                }
                await upload();
            };

            // If browser can't decode the format (e.g. AVIF), skip ratio check and upload anyway
            img.onerror = async () => {
                URL.revokeObjectURL(objectUrl);
                await upload();
            };

            img.src = objectUrl;
        };
        reader.readAsDataURL(file);
        imageInput.value = '';
    });

    // ---- BACKUPS ----
    const backupBtn = document.getElementById('cmsBackupBtn');
    const backupsEntries = document.getElementById('cmsBackupsEntries');
    const restoreConfirmOverlay = document.getElementById('cmsRestoreConfirm');
    const restoreCancel = document.getElementById('cmsRestoreCancel');
    const restoreConfirmBtn = document.getElementById('cmsRestoreConfirmBtn');
    const restoreMsg = document.getElementById('cmsRestoreMsg');
    let restoreId = null;

    if (backupBtn) backupBtn.addEventListener('click', async () => {
        backupBtn.textContent = 'Backing up...';
        backupBtn.disabled = true;
        try {
            const res = await fetch('/api/admin/backup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({})
            });
            if (!res.ok) throw new Error('Backup failed');
            backupBtn.textContent = 'Backed up!';
            setTimeout(() => {
                backupBtn.textContent = 'Backup current content';
                backupBtn.disabled = false;
            }, 2000);
        } catch (err) {
            backupBtn.textContent = 'Backup current content';
            backupBtn.disabled = false;
            alert('Failed to create backup. Please try again.');
        }
    });

    detailLoaders['cmsBackupsDetail'] = async () => {
        if (!backupsEntries) return;
        backupsEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const res = await fetch('/api/admin/backups', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (data.backups.length === 0) {
                backupsEntries.innerHTML = '<span class="cms-log-empty">No backups yet.</span>';
                return;
            }
            backupsEntries.innerHTML = data.backups.map(b => {
                const date = new Date(b.created_at);
                const timeStr = date.toLocaleDateString('en-GB', {
                    day: '2-digit', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });
                return `<div class="cms-log-entry cms-backup-entry">
                    <div>
                        <span class="log-action">${b.label}</span><br>
                        <span class="log-time">${b.username} &middot; ${timeStr}</span>
                    </div>
                    <button class="cms-backup-restore" data-id="${b.id}" data-label="${b.label}">
                        Restore
                    </button>
                </div>`;
            }).join('');
            backupsEntries.querySelectorAll('.cms-backup-restore').forEach(btn => {
                btn.addEventListener('click', () => {
                    restoreId = btn.dataset.id;
                    restoreMsg.textContent = `Restore backup "${btn.dataset.label}"? All current content and images will be replaced.`;
                    restoreConfirmOverlay.classList.add('active');
                });
            });
        } catch (err) {
            backupsEntries.innerHTML = '<span class="cms-log-error">Failed to load backups.</span>';
        }
    };

    if (restoreCancel) restoreCancel.addEventListener('click', () => {
        restoreConfirmOverlay.classList.remove('active');
        restoreId = null;
    });

    if (restoreConfirmOverlay) restoreConfirmOverlay.addEventListener('click', (e) => {
        if (e.target === restoreConfirmOverlay) {
            restoreConfirmOverlay.classList.remove('active');
            restoreId = null;
        }
    });

    if (restoreConfirmBtn) restoreConfirmBtn.addEventListener('click', async () => {
        if (!restoreId) return;
        restoreConfirmBtn.disabled = true;
        restoreConfirmBtn.textContent = 'Restoring...';
        try {
            const res = await fetch(`/api/admin/backup/${restoreId}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                }
            });
            if (!res.ok) throw new Error('Restore failed');
            window.location.reload();
        } catch (err) {
            restoreConfirmBtn.disabled = false;
            restoreConfirmBtn.textContent = 'Restore';
            alert('Failed to restore backup. Please try again.');
        }
    });

    // ---- THEME SWITCHER ----
    // Apply each swatch's background from its data-swatch attribute so the
    // admin-menu partial doesn't need an inline style= attribute (CSP).
    document.querySelectorAll('.cms-theme-swatch').forEach(swatch => {
        if (swatch.dataset.swatch) {
            swatch.style.background = swatch.dataset.swatch;
        }
    });

    document.querySelectorAll('.cms-theme-swatch').forEach(swatch => {
        swatch.addEventListener('click', async () => {
            const theme = swatch.dataset.theme;
            try {
                const res = await fetch('/api/admin/theme', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ theme })
                });
                if (!res.ok) throw new Error('Theme change failed');
                window.location.reload();
            } catch (err) {
                alert('Failed to change theme. Please try again.');
            }
        });
    });

    // Content reset (admin only)
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            confirmOverlay.classList.add('active');
        });

        confirmCancel.addEventListener('click', () => {
            confirmOverlay.classList.remove('active');
        });

        confirmReset.addEventListener('click', async () => {
            confirmReset.disabled = true;
            confirmReset.textContent = 'Resetting...';
            try {
                const res = await fetch('/api/admin/reset', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    }
                });
                if (!res.ok) throw new Error('Reset failed');
                window.location.reload();
            } catch (err) {
                confirmReset.disabled = false;
                confirmReset.textContent = 'Reset';
                alert('Failed to reset content. Please try again.');
            }
        });

        confirmOverlay.addEventListener('click', (e) => {
            if (e.target === confirmOverlay) confirmOverlay.classList.remove('active');
        });
    }

    // ---- PAGE MANAGEMENT ----
    const addPageBtn = document.getElementById('cmsAddPageBtn');
    const renamePageBtn = document.getElementById('cmsRenamePageBtn');
    const hidePageBtn = document.getElementById('cmsHidePageBtn');
    const deletePageBtn = document.getElementById('cmsDeletePageBtn');
    const deletePageConfirmOverlay = document.getElementById('cmsDeletePageConfirm');
    const deletePageCancel = document.getElementById('cmsDeletePageCancel');
    const deletePageConfirmBtn = document.getElementById('cmsDeletePageConfirmBtn');

    if (addPageBtn) {
        addPageBtn.addEventListener('click', async () => {
            const title = prompt('Enter a name for the new page:');
            if (!title || !title.trim()) return;
            addPageBtn.disabled = true;
            addPageBtn.textContent = 'Creating...';
            try {
                const res = await fetch('/api/admin/page', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ title: title.trim() })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to create page');
                window.location.href = '/' + data.slug;
            } catch (err) {
                addPageBtn.disabled = false;
                addPageBtn.textContent = 'Add page';
                alert(err.message || 'Failed to create page. Please try again.');
            }
        });
    }

    if (renamePageBtn) {
        renamePageBtn.addEventListener('click', async () => {
            const current = document.querySelector('.cms-theme-label strong')?.textContent || '';
            const title = prompt('Rename this page:', current);
            if (!title || !title.trim() || title.trim() === current) return;
            try {
                const res = await fetch(`/api/admin/page/${encodeURIComponent(pageSlug)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ title: title.trim() })
                });
                if (!res.ok) throw new Error('Rename failed');
                window.location.reload();
            } catch (err) {
                alert('Failed to rename page. Please try again.');
            }
        });
    }

    if (hidePageBtn) {
        hidePageBtn.addEventListener('click', async () => {
            const willHide = !pageHidden;
            try {
                const res = await fetch(`/api/admin/page/${encodeURIComponent(pageSlug)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({ hidden: willHide })
                });
                if (!res.ok) throw new Error('Toggle failed');
                window.location.reload();
            } catch (err) {
                alert('Failed to update page visibility. Please try again.');
            }
        });
    }

    const deletePageMsg = document.getElementById('cmsDeletePageMsg');

    if (deletePageBtn && deletePageConfirmOverlay) {
        deletePageBtn.addEventListener('click', () => {
            const pageName = document.querySelector('.cms-page-section .cms-theme-label strong')?.textContent || pageSlug;
            if (deletePageMsg) {
                deletePageMsg.textContent = `Are you sure you want to delete "${pageName}"? The page and its layout will be removed. Section content stays in the database and can be reused on other pages.`;
            }
            deletePageConfirmOverlay.classList.add('active');
            adminPanel?.classList.remove('active');
        });

        deletePageCancel.addEventListener('click', () => {
            deletePageConfirmOverlay.classList.remove('active');
        });

        deletePageConfirmOverlay.addEventListener('click', (e) => {
            if (e.target === deletePageConfirmOverlay) deletePageConfirmOverlay.classList.remove('active');
        });

        deletePageConfirmBtn.addEventListener('click', async () => {
            deletePageConfirmBtn.disabled = true;
            deletePageConfirmBtn.textContent = 'Deleting...';
            try {
                const res = await fetch(`/api/admin/page/${encodeURIComponent(pageSlug)}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    }
                });
                if (!res.ok) throw new Error('Delete failed');
                window.location.href = '/';
            } catch (err) {
                deletePageConfirmBtn.disabled = false;
                deletePageConfirmBtn.textContent = 'Delete page';
                alert('Failed to delete page. Please try again.');
            }
        });
    }

    // ---- PERMISSIONS MATRIX ----
    const permissionsEntries = document.getElementById('cmsPermissionsEntries');

    const capLabels = {
        edit_content: 'Edit content',
        manage_sections: 'Sections',
        manage_pages: 'Pages',
        manage_backups: 'Backups',
        manage_theme: 'Theme',
        view_activity: 'Activity',
        manage_users: 'Users',
        manage_page_access: 'Page access',
        manage_seo: 'SEO',
        reset_content: 'Reset',
        view_csp: 'CSP',
        manage_permissions: 'Permissions'
    };

    async function loadPermissions() {
        if (!permissionsEntries) return;
        permissionsEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const res = await fetch('/api/admin/permissions', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await res.json();
            if (!data.matrix) { permissionsEntries.innerHTML = 'Failed to load.'; return; }

            const caps = data.capabilities;
            const roles = data.roles;
            const matrix = data.matrix;

            let html = '<div class="cms-perms-grid">';
            html += '<table class="cms-perms-table"><thead><tr><th>Role</th>';
            for (const cap of caps) {
                html += `<th title="${capLabels[cap] || cap}">${capLabels[cap] || cap}</th>`;
            }
            html += '</tr></thead><tbody>';
            for (const role of roles) {
                html += `<tr><td class="cms-perms-role">${role}</td>`;
                for (const cap of caps) {
                    const checked = matrix[role][cap] ? 'checked' : '';
                    // manage_permissions is locked: always on for admin, always off for others
                    const locked = cap === 'manage_permissions' || role === 'admin';
                    const disabled = locked ? 'disabled' : '';
                    html += `<td><input type="checkbox" ${checked} ${disabled} data-role="${role}" data-cap="${cap}"></td>`;
                }
                html += '</tr>';
            }
            html += '</tbody></table></div>';
            html += '<button class="cms-btn cms-btn-save cms-perms-save" id="cmsPermsSaveBtn">Save permissions</button>';
            permissionsEntries.innerHTML = html;

            document.getElementById('cmsPermsSaveBtn').addEventListener('click', async () => {
                const saveBtn = document.getElementById('cmsPermsSaveBtn');
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                const updated = {};
                for (const role of roles) { updated[role] = {}; }
                permissionsEntries.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    const r = cb.dataset.role;
                    const c = cb.dataset.cap;
                    if (r && c) updated[r][c] = cb.checked;
                });
                try {
                    const r = await fetch('/api/admin/permissions', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        body: JSON.stringify({ matrix: updated })
                    });
                    if (!r.ok) throw new Error('Save failed');
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => { saveBtn.textContent = 'Save permissions'; saveBtn.disabled = false; }, 1500);
                } catch (err) {
                    alert('Failed to save permissions.');
                    saveBtn.textContent = 'Save permissions';
                    saveBtn.disabled = false;
                }
            });
        } catch (err) {
            permissionsEntries.innerHTML = '<span class="cms-log-error">Failed to load permissions.</span>';
        }
    }

    detailLoaders['cmsPermissionsDetail'] = () => loadPermissions();

    // ---- PAGE ACCESS ----
    const pageAccessEntries = document.getElementById('cmsPageAccessEntries');

    async function loadPageAccess() {
        if (!pageAccessEntries) return;
        pageAccessEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const pgRes = await fetch(`/api/admin/page-access/by-slug/${encodeURIComponent(pageSlug)}`, {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await pgRes.json();
            if (!pgRes.ok) throw new Error(data.error || 'Failed');

            if (!data.clients || data.clients.length === 0) {
                pageAccessEntries.innerHTML = '<span class="cms-log-empty">No client users exist yet. Create a client user first.</span>';
                return;
            }

            let html = '<div class="cms-page-access-list">';
            for (const c of data.clients) {
                html += `<label class="cms-page-access-item">
                    <input type="checkbox" ${c.hasAccess ? 'checked' : ''} data-uid="${c.id}">
                    <span>${escapeHtml(c.username)}</span>
                </label>`;
            }
            html += '</div>';
            html += `<button class="cms-btn cms-btn-save cms-perms-save" id="cmsPageAccessSaveBtn" data-page-id="${data.pageId}">Save access</button>`;
            pageAccessEntries.innerHTML = html;

            document.getElementById('cmsPageAccessSaveBtn').addEventListener('click', async () => {
                const saveBtn = document.getElementById('cmsPageAccessSaveBtn');
                const pid = saveBtn.dataset.pageId;
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
                const userIds = [];
                pageAccessEntries.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    if (cb.checked) userIds.push(parseInt(cb.dataset.uid, 10));
                });
                try {
                    const r = await fetch(`/api/admin/page-access/${pid}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        body: JSON.stringify({ userIds })
                    });
                    if (!r.ok) throw new Error('Save failed');
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => { saveBtn.textContent = 'Save access'; saveBtn.disabled = false; }, 1500);
                } catch (err) {
                    alert('Failed to save page access.');
                    saveBtn.textContent = 'Save access';
                    saveBtn.disabled = false;
                }
            });
        } catch (err) {
            pageAccessEntries.innerHTML = '<span class="cms-log-error">Failed to load page access.</span>';
        }
    }

    detailLoaders['cmsPageAccessDetail'] = () => loadPageAccess();

    // ---- REORDER PAGES & NAVIGATION ----
    const reorderPagesEntries = document.getElementById('cmsReorderPagesEntries');
    let reorderPagesList = [];  // [{slug, title, hidden, show_in_nav, nav_label}]

    function renderReorderPages() {
        if (!reorderPagesEntries) return;
        if (reorderPagesList.length === 0) {
            reorderPagesEntries.innerHTML = '<span class="cms-log-empty">No pages.</span>';
            return;
        }
        let html = '<div class="cms-reorder-list">';
        for (let i = 0; i < reorderPagesList.length; i++) {
            const p = reorderPagesList[i];
            const isFirst = i === 0;
            const isLast = i === reorderPagesList.length - 1;
            const isMain = p.slug === 'main';
            html += `<div class="cms-reorder-item cms-nav-item">
                <span class="cms-reorder-title${p.hidden ? ' cms-reorder-hidden' : ''}">${escapeHtml(p.title)}</span>
                <div class="cms-reorder-btns">
                    <button class="cms-reorder-btn" data-dir="up" data-idx="${i}"${isFirst ? ' disabled' : ''} title="Move up">&#9650;</button>
                    <button class="cms-reorder-btn" data-dir="down" data-idx="${i}"${isLast ? ' disabled' : ''} title="Move down">&#9660;</button>
                </div>
                <label class="cms-nav-toggle">
                    <input type="checkbox" class="cms-nav-show" data-slug="${escapeHtml(p.slug)}" ${p.show_in_nav ? 'checked' : ''} ${isMain ? 'disabled' : ''}>
                    Show in nav
                </label>
                <input type="text" class="cms-nav-label" data-slug="${escapeHtml(p.slug)}" value="${escapeHtml(p.nav_label || '')}" placeholder="Nav label (defaults to &quot;${escapeHtml(p.title)}&quot;)">
            </div>`;
        }
        html += '</div><div class="cms-reorder-status" id="cmsReorderStatus"></div>';
        reorderPagesEntries.innerHTML = html;

        reorderPagesEntries.querySelectorAll('.cms-reorder-btn').forEach(btn => {
            btn.addEventListener('click', () => movePage(parseInt(btn.dataset.idx, 10), btn.dataset.dir));
        });

        reorderPagesEntries.querySelectorAll('.cms-nav-show').forEach(cb => {
            cb.addEventListener('change', () => saveNavSetting(cb.dataset.slug, { show_in_nav: cb.checked }));
        });

        reorderPagesEntries.querySelectorAll('.cms-nav-label').forEach(inp => {
            inp.addEventListener('change', () => saveNavSetting(inp.dataset.slug, { nav_label: inp.value }));
        });
    }

    async function saveNavSetting(slug, body) {
        const status = document.getElementById('cmsReorderStatus');
        if (status) status.textContent = 'Saving...';
        try {
            const r = await fetch(`/api/admin/page/${encodeURIComponent(slug)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(body)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Save failed');
            const entry = reorderPagesList.find(p => p.slug === slug);
            if (entry) Object.assign(entry, body);
            if (status) status.textContent = 'Saved. Reload to see it reflected in the menu.';
        } catch (err) {
            if (status) status.textContent = err.message || 'Save failed. Try again.';
        }
    }

    async function movePage(idx, dir) {
        const j = dir === 'up' ? idx - 1 : idx + 1;
        if (j < 0 || j >= reorderPagesList.length) return;
        // Swap locally
        const tmp = reorderPagesList[idx];
        reorderPagesList[idx] = reorderPagesList[j];
        reorderPagesList[j] = tmp;
        renderReorderPages();

        const status = document.getElementById('cmsReorderStatus');
        if (status) status.textContent = 'Saving...';
        try {
            const r = await fetch('/api/admin/page-order', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ order: reorderPagesList.map(p => p.slug) })
            });
            if (!r.ok) throw new Error('Save failed');
            if (status) {
                status.textContent = 'Saved. Reload to see the new order in the menu.';
            }
        } catch (err) {
            if (status) status.textContent = 'Save failed. Try again.';
        }
    }

    async function loadReorderPages() {
        if (!reorderPagesEntries) return;
        reorderPagesEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const r = await fetch('/api/admin/pages', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            reorderPagesList = (data.pages || []).map(p => ({
                slug: p.slug, title: p.title, hidden: p.hidden,
                show_in_nav: p.show_in_nav, nav_label: p.nav_label
            }));
            renderReorderPages();
        } catch (err) {
            reorderPagesEntries.innerHTML = '<span class="cms-log-error">Failed to load pages.</span>';
        }
    }

    detailLoaders['cmsReorderPagesDetail'] = () => loadReorderPages();

    // ---- SEO: per-page metadata ----
    const seoEntries = document.getElementById('cmsSeoEntries');

    // Recommended display lengths Google tends to show before truncating.
    const SEO_LIMITS = { meta_title: 60, meta_description: 160 };

    function seoCounter(field, value) {
        const limit = SEO_LIMITS[field];
        if (!limit) return '';
        const len = (value || '').length;
        const over = len > limit ? ' cms-seo-count-over' : '';
        return `<span class="cms-seo-count${over}" data-count-for="${field}">${len} / ${limit}</span>`;
    }

    async function loadPageSeo() {
        if (!seoEntries) return;
        seoEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const r = await fetch(`/api/admin/seo/${encodeURIComponent(pageSlug)}`, {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            const p = data.page;
            const defs = data.defaults || {};

            const titleFallback = pageSlug === 'main'
                ? 'Arrington Consultancy'
                : `${p.title} | Arrington Consultancy`;
            const descFallback = defs['seo.default_description'] || '(no site default set)';
            const ogImgFallback = defs['seo.default_og_image'] || '';

            let html = '<div class="cms-seo-form">';

            html += `<label class="cms-seo-label">Page title
                <span class="cms-seo-hint">The browser tab and Google's blue link. Leave blank to use: ${escapeHtml(titleFallback)}</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seo="meta_title" value="${escapeHtml(p.meta_title || '')}" placeholder="${escapeHtml(titleFallback)}">
                ${seoCounter('meta_title', p.meta_title || '')}
            </label>`;

            html += `<label class="cms-seo-label">Meta description
                <span class="cms-seo-hint">The grey summary under the link in search results. Leave blank to use the site default.</span>
                <textarea class="cms-user-input cms-seo-input cms-seo-textarea" data-seo="meta_description" rows="3" placeholder="${escapeHtml(descFallback)}">${escapeHtml(p.meta_description || '')}</textarea>
                ${seoCounter('meta_description', p.meta_description || '')}
            </label>`;

            html += `<label class="cms-seo-label">Keywords <span class="cms-seo-hint">Comma-separated. Largely ignored by Google now; safe to leave blank.</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seo="meta_keywords" value="${escapeHtml(p.meta_keywords || '')}" placeholder="business consultancy, Plymouth, cash flow">
            </label>`;

            html += `<label class="cms-seo-label">Canonical URL <span class="cms-seo-hint">The preferred address for this page. Leave blank to use this page's own URL.</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seo="canonical_url" value="${escapeHtml(p.canonical_url || '')}" placeholder="https://www.arringtonconsultancy.com${pageSlug === 'main' ? '/' : '/' + pageSlug}">
            </label>`;

            html += '<div class="cms-seo-subhead">Social sharing (Facebook, LinkedIn, X)</div>';

            html += `<label class="cms-seo-label">Social title <span class="cms-seo-hint">Shown when the page is shared. Leave blank to use the page title above.</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seo="og_title" value="${escapeHtml(p.og_title || '')}" placeholder="Uses the page title">
            </label>`;

            html += `<label class="cms-seo-label">Social description <span class="cms-seo-hint">Leave blank to use the meta description above.</span>
                <textarea class="cms-user-input cms-seo-input cms-seo-textarea" data-seo="og_description" rows="2" placeholder="Uses the meta description">${escapeHtml(p.og_description || '')}</textarea>
            </label>`;

            html += `<label class="cms-seo-label">Social image URL <span class="cms-seo-hint">Full URL to a share image (ideally 1200x630). ${ogImgFallback ? 'Leave blank to use the site default.' : 'Leave blank for no image.'}</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seo="og_image" value="${escapeHtml(p.og_image || '')}" placeholder="${escapeHtml(ogImgFallback || 'https://www.arringtonconsultancy.com/img/share.jpg')}">
            </label>`;

            html += `<label class="cms-seo-check">
                <input type="checkbox" data-seo="noindex" ${p.noindex ? 'checked' : ''}>
                <span>Hide this page from search engines (noindex)</span>
            </label>`;

            html += `<button class="cms-btn cms-btn-save cms-perms-save" id="cmsSeoSaveBtn">Save SEO</button>`;
            html += '<div class="cms-reorder-status" id="cmsSeoStatus"></div>';
            html += '</div>';

            seoEntries.innerHTML = html;

            // Live character counters
            seoEntries.querySelectorAll('[data-seo="meta_title"], [data-seo="meta_description"]').forEach(el => {
                el.addEventListener('input', () => {
                    const field = el.dataset.seo;
                    const counter = seoEntries.querySelector(`[data-count-for="${field}"]`);
                    if (counter) {
                        const limit = SEO_LIMITS[field];
                        counter.textContent = `${el.value.length} / ${limit}`;
                        counter.classList.toggle('cms-seo-count-over', el.value.length > limit);
                    }
                });
            });

            document.getElementById('cmsSeoSaveBtn').addEventListener('click', async () => {
                const btn = document.getElementById('cmsSeoSaveBtn');
                const status = document.getElementById('cmsSeoStatus');
                btn.disabled = true;
                btn.textContent = 'Saving...';
                const payload = {};
                seoEntries.querySelectorAll('[data-seo]').forEach(el => {
                    if (el.type === 'checkbox') payload[el.dataset.seo] = el.checked;
                    else payload[el.dataset.seo] = el.value;
                });
                try {
                    const sr = await fetch(`/api/admin/seo/${encodeURIComponent(pageSlug)}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        body: JSON.stringify(payload)
                    });
                    if (!sr.ok) throw new Error('Save failed');
                    btn.textContent = 'Saved';
                    if (status) status.textContent = 'Saved. Reload the page to see the new tags in the page source.';
                    setTimeout(() => { btn.textContent = 'Save SEO'; btn.disabled = false; }, 1500);
                } catch (err) {
                    if (status) status.textContent = 'Save failed. Try again.';
                    btn.textContent = 'Save SEO';
                    btn.disabled = false;
                }
            });
        } catch (err) {
            seoEntries.innerHTML = '<span class="cms-log-error">Failed to load SEO settings.</span>';
        }
    }

    detailLoaders['cmsSeoDetail'] = () => loadPageSeo();

    // ---- SEO: site-wide defaults ----
    const seoDefaultsEntries = document.getElementById('cmsSeoDefaultsEntries');

    async function loadSeoDefaults() {
        if (!seoDefaultsEntries) return;
        seoDefaultsEntries.innerHTML = '<span class="cms-log-loading">Loading...</span>';
        try {
            const r = await fetch('/api/admin/seo-defaults', {
                headers: { 'X-CSRF-Token': csrfToken }
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Failed');
            const d = data.defaults || {};

            let html = '<div class="cms-seo-form">';
            html += '<p class="cms-seo-hint">These apply to any page where you leave the matching SEO field blank.</p>';

            html += `<label class="cms-seo-label">Site name <span class="cms-seo-hint">Used in social share cards.</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seodef="seo.site_name" value="${escapeHtml(d['seo.site_name'] || '')}" placeholder="Arrington Business Consultancy">
            </label>`;

            html += `<label class="cms-seo-label">Default meta description <span class="cms-seo-hint">Fallback summary for pages without their own.</span>
                <textarea class="cms-user-input cms-seo-input cms-seo-textarea" data-seodef="seo.default_description" rows="3">${escapeHtml(d['seo.default_description'] || '')}</textarea>
            </label>`;

            html += `<label class="cms-seo-label">Default social image URL <span class="cms-seo-hint">Full URL to a default share image (1200x630).</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seodef="seo.default_og_image" value="${escapeHtml(d['seo.default_og_image'] || '')}" placeholder="https://www.arringtonconsultancy.com/img/share.jpg">
            </label>`;

            html += `<label class="cms-seo-label">X / Twitter handle <span class="cms-seo-hint">Optional, including the @.</span>
                <input type="text" class="cms-user-input cms-seo-input" data-seodef="seo.twitter_handle" value="${escapeHtml(d['seo.twitter_handle'] || '')}" placeholder="@arrington">
            </label>`;

            html += `<button class="cms-btn cms-btn-save cms-perms-save" id="cmsSeoDefaultsSaveBtn">Save defaults</button>`;
            html += '<div class="cms-reorder-status" id="cmsSeoDefaultsStatus"></div>';
            html += '</div>';

            seoDefaultsEntries.innerHTML = html;

            document.getElementById('cmsSeoDefaultsSaveBtn').addEventListener('click', async () => {
                const btn = document.getElementById('cmsSeoDefaultsSaveBtn');
                const status = document.getElementById('cmsSeoDefaultsStatus');
                btn.disabled = true;
                btn.textContent = 'Saving...';
                const payload = {};
                seoDefaultsEntries.querySelectorAll('[data-seodef]').forEach(el => {
                    payload[el.dataset.seodef] = el.value;
                });
                try {
                    const sr = await fetch('/api/admin/seo-defaults', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                        body: JSON.stringify(payload)
                    });
                    if (!sr.ok) throw new Error('Save failed');
                    btn.textContent = 'Saved';
                    if (status) status.textContent = 'Saved.';
                    setTimeout(() => { btn.textContent = 'Save defaults'; btn.disabled = false; }, 1500);
                } catch (err) {
                    if (status) status.textContent = 'Save failed. Try again.';
                    btn.textContent = 'Save defaults';
                    btn.disabled = false;
                }
            });
        } catch (err) {
            seoDefaultsEntries.innerHTML = '<span class="cms-log-error">Failed to load SEO defaults.</span>';
        }
    }

    detailLoaders['cmsSeoDefaultsDetail'] = () => loadSeoDefaults();
})();
