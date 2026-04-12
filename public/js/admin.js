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

    // Section field labels for readable modal fields
    const fieldLabels = {
        'hero.heading': 'Heading',
        'hero.subtext': 'Subtext',
        'hero.cta': 'Button text',
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
        'contact.label': 'Section label',
        'contact.heading': 'Heading',
        'contact.body': 'Body text',
        'contact.email': 'Email address',
        'contact.phone': 'Phone number'
    };

    const sectionTitles = {
        hero: 'Hero',
        credentials_oxford: 'Oxford Credential',
        credentials_stat: 'Revenue Statistic',
        biography: 'Biography',
        intervention: 'Intervention',
        approach: 'Approach',
        insights: 'Insights',
        casestudy: 'Case Study',
        casestudy2: 'Case Study: Tristan',
        assessment: 'Assessment',
        filter: 'Filter',
        contact: 'Contact'
    };

    // Determine textarea height class based on expected content length
    function heightClass(key) {
        if (key.includes('label') || key.includes('tag') || key.includes('stat') ||
            key.includes('cta') || key.includes('email') || key.includes('phone') ||
            key.includes('_title')) {
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
        const textareas = modalFields.querySelectorAll('textarea');
        const fields = [];
        textareas.forEach(ta => {
            fields.push({ key: ta.dataset.key, content: ta.value });
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
    const logBtn = document.getElementById('cmsLogBtn');
    const logSection = document.getElementById('cmsAdminLog');
    const logEntries = document.getElementById('cmsLogEntries');
    const cspBtn = document.getElementById('cmsCspBtn');
    const cspList = document.getElementById('cmsCspList');
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

    // Activity log
    if (logBtn) {
        logBtn.addEventListener('click', async () => {
            const wasHidden = logSection.classList.toggle('cms-hidden');
            if (!wasHidden) {
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
            }
        });
    }

    // ---- CSP VIOLATIONS (admin only) ----
    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    if (cspBtn && cspList && cspEntries) {
        cspBtn.addEventListener('click', () => {
            const nowHidden = cspList.classList.toggle('cms-hidden');
            if (nowHidden) return;
            const violations = window.__cspViolations || [];
            if (violations.length === 0) {
                cspEntries.innerHTML = '<span class="cms-log-empty">No CSP violations on this page. Reload the page to refresh.</span>';
                return;
            }
            cspEntries.innerHTML = violations.map(v => {
                const where = v.source ? `${escapeHtml(v.source)}:${v.line}` : '';
                return `<div class="cms-log-entry">
                    <span class="log-action">${escapeHtml(v.directive)}</span><br>
                    <span class="log-time">blocked: ${escapeHtml(v.blocked)}${where ? ' — ' + where : ''}</span>
                </div>`;
            }).join('');
        });
    }

    // ---- USER MANAGEMENT (admin only) ----
    const usersBtn = document.getElementById('cmsUsersBtn');
    const usersList = document.getElementById('cmsUsersList');
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

    if (usersBtn && usersList) {
        usersBtn.addEventListener('click', () => {
            const wasHidden = usersList.classList.toggle('cms-hidden');
            if (!wasHidden) loadUsers();
        });
    }

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
                document.getElementById('cmsNewRole').value = 'content';
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

    function checkAspectRatio(width, height, key) {
        const expected = expectedRatios[key];
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
                    const ratioLabel = ratioLabels[currentImageKey] || 'the same as the original';
                    alert(`This image has the wrong aspect ratio. The ${currentImageKey} needs to be approximately ${ratioLabel}. Please crop or resize your image and try again.`);
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
    const backupsListBtn = document.getElementById('cmsBackupsListBtn');
    const backupsListSection = document.getElementById('cmsBackupsList');
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

    if (backupsListBtn) backupsListBtn.addEventListener('click', async () => {
        const wasHidden = backupsListSection.classList.toggle('cms-hidden');
        if (!wasHidden) {
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

                // Attach restore handlers
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
        }
    });

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
})();
