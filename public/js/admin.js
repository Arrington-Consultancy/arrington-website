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
        modalFields.innerHTML = '<p style="color:#8a8680;font-size:0.85rem">Loading...</p>';
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
            modalFields.innerHTML = '<p style="color:#e85d5d;font-size:0.85rem">Failed to load content. Please try again.</p>';
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

    adminToggle.addEventListener('click', () => {
        adminPanel.classList.toggle('active');
    });

    // Close panel when clicking outside
    document.addEventListener('click', (e) => {
        if (!adminPanel.contains(e.target) && e.target !== adminToggle) {
            adminPanel.classList.remove('active');
        }
    });

    // Activity log
    if (logBtn) {
        logBtn.addEventListener('click', async () => {
            logSection.style.display = logSection.style.display === 'none' ? 'block' : 'none';
            if (logSection.style.display === 'block') {
                logEntries.innerHTML = '<span style="color:#5a5650;font-size:0.78rem">Loading...</span>';
                try {
                    const res = await fetch('/api/admin/log', {
                        headers: { 'X-CSRF-Token': csrfToken }
                    });
                    const data = await res.json();

                    if (data.log.length === 0) {
                        logEntries.innerHTML = '<span style="color:#5a5650;font-size:0.78rem">No activity yet.</span>';
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
                    logEntries.innerHTML = '<span style="color:#e85d5d;font-size:0.78rem">Failed to load log.</span>';
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

        // Check aspect ratio before uploading
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = async () => {
            URL.revokeObjectURL(objectUrl);

            if (!checkAspectRatio(img.width, img.height, currentImageKey)) {
                const expected = expectedRatios[currentImageKey];
                const ratioLabels = { headshot: '3:4 portrait', logo: '2:1 landscape', oxford: '4:3 landscape' };
                const ratioLabel = ratioLabels[currentImageKey] || 'the same as the original';
                alert(`This image has the wrong aspect ratio. The ${currentImageKey} needs to be approximately ${ratioLabel}. Please crop or resize your image and try again.`);
                imageInput.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = reader.result.split(',')[1];
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
            reader.readAsDataURL(file);
        };
        img.src = objectUrl;
        imageInput.value = '';
    });

    // ---- THEME SWITCHER ----
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
