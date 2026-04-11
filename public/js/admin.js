(function () {
    'use strict';

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;

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

    async function openModal(section) {
        currentSection = section;
        modalTitle.textContent = 'Edit: ' + (sectionTitles[section] || section);
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
                label.textContent = fieldLabels[key] || key.split('.').pop().replace(/_/g, ' ');
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
        document.querySelectorAll('.cms-move-btn').forEach(btn => {
            const sectionId = btn.dataset.sectionId;
            const section = document.querySelector(`section[data-section-id="${sectionId}"]`);
            const sectionsList = Array.from(sections);
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
                body: JSON.stringify({ order })
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

    // ---- ADMIN PANEL ----
    const adminToggle = document.getElementById('cmsAdminToggle');
    const adminPanel = document.getElementById('cmsAdminPanel');
    const logBtn = document.getElementById('cmsLogBtn');
    const logSection = document.getElementById('cmsAdminLog');
    const logEntries = document.getElementById('cmsLogEntries');
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
})();
