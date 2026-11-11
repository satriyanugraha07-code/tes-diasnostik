(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const views = {
    home: byId('home-view'),
    quiz: byId('quiz-view'),
    review: byId('review-view'),
    result: byId('result-view')
  };
  const titles = { quiz: 'quiz-title', review: 'review-title', result: 'result-title' };
  const labels = { home: 'Kelas X', quiz: 'Ruang ujian', review: 'Cek jawaban', result: 'Hasil tes' };
  const startForm = byId('start-form');
  const startButton = byId('start-button');
  const fields = [byId('student-name'), byId('student-class'), byId('student-number')];
  const resumeNote = byId('resume-note');
  const quizTimer = byId('quiz-timer');
  const reviewTimer = byId('review-timer');
  const quizSaveNote = byId('quiz-save-note');
  const gridDialog = byId('grid-dialog');
  const confirmDialog = byId('confirm-dialog');
  const gridButton = byId('grid-button');
  const markButton = byId('mark-button');
  const nextButton = byId('next-button');
  const prevButton = byId('prev-button');
  const submitButton = byId('submit-button');
  const confirmSubmit = byId('confirm-submit');
  const total = exam.questions.length;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const draftKey = `${exam.id}:draft`;
  const resultKey = (id) => `${exam.id}:submission:${id}`;
  const limit = exam.durationMinutes ? exam.durationMinutes * 60 : null;

  let currentView = 'home';
  let attempt = readDraft();
  let result = attempt ? readStored(resultKey(attempt.id)) : null;
  let savedResult = Boolean(result);
  let saving = false;
  let timerId;

  function readStored(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  }

  function readDraft() {
    const draft = readStored(draftKey);
    if (!draft || !Number.isFinite(draft.startedAt) || !Number.isInteger(draft.index)) return null;
    if (draft.index < 0 || draft.index >= total) return null;
    if (!Array.isArray(draft.answers) || !Array.isArray(draft.marked)) return null;
    if (draft.answers.length !== total || draft.marked.length !== total) return null;
    return draft;
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(attempt));
      if (quizSaveNote) quizSaveNote.hidden = true;
    } catch {
      if (quizSaveNote) {
        quizSaveNote.textContent = 'Progres tidak bisa disimpan di browser ini. Biarkan halaman tetap terbuka.';
        quizSaveNote.hidden = false;
      }
    }
  }

  // Apps Script can be connected here when an endpoint is available.
  async function persistSubmission(payload) {
    localStorage.setItem(resultKey(payload.attemptId), JSON.stringify(payload));
  }

  function textButton(button, text) {
    const label = button.querySelector('[data-label]');
    (label || button).textContent = text;
  }

  function span(className, text) {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  }

  function showView(name, moveFocus = true) {
    currentView = name;
    Object.entries(views).forEach(([key, section]) => { section.hidden = key !== name; });
    const label = byId('app-view-label');
    if (label) label.textContent = labels[name];
    if (!moveFocus) return;

    window.scrollTo(0, 0);
    const target = titles[name] ? byId(titles[name]) : views.home.querySelector('h1');
    if (target) {
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }

  function elapsedSeconds() {
    return Math.max(0, Math.floor((Date.now() - attempt.startedAt) / 1000));
  }

  function formatClock(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const remainder = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function updateClock() {
    if (currentView !== 'quiz' && currentView !== 'review') return;
    if (!attempt || saving) return;

    const elapsed = elapsedSeconds();
    const remaining = limit === null ? elapsed : Math.max(0, limit - elapsed);
    [quizTimer, reviewTimer].filter(Boolean).forEach((timer) => {
      const time = formatClock(remaining);
      if (timer.textContent !== time) timer.textContent = time;
      timer.classList.toggle('is-urgent', limit !== null && remaining <= 60);
    });
    if (limit !== null && remaining === 0) void finishAttempt(true);
  }

  function startClock() {
    clearInterval(timerId);
    if (!result) timerId = setInterval(updateClock, 250);
    updateClock();
  }

  function renderProgress() {
    const answered = attempt.answers.filter((answer) => answer !== null).length;
    const progress = byId('quiz-progress');
    progress.style.width = `${answered / total * 100}%`;
    byId('quiz-progress-label').textContent = `${answered} dari ${total} soal terjawab`;
  }

  function renderMark() {
    const marked = attempt.marked[attempt.index];
    markButton.setAttribute('aria-pressed', String(marked));
    textButton(markButton, marked ? 'Ditandai' : 'Tandai soal');
  }

  function renderQuestion() {
    const { index, answers } = attempt;
    const question = exam.questions[index];
    byId('quiz-title').textContent = `Soal ${index + 1}`;
    byId('quiz-position').textContent = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    byId('question-prompt').textContent = question.prompt;

    const image = byId('question-image');
    image.hidden = !question.image;
    image.alt = question.imageAlt || '';
    if (question.image) image.src = question.image;
    else image.removeAttribute('src');

    const options = byId('question-options');
    options.setAttribute('role', 'radiogroup');
    options.setAttribute('aria-labelledby', 'question-prompt');
    options.replaceChildren(...question.options.map((option, optionIndex) => {
      const label = document.createElement('label');
      label.className = 'choice';
      label.classList.toggle('is-selected', answers[index] === optionIndex);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'choice';
      input.value = String(optionIndex);
      input.checked = answers[index] === optionIndex;
      const indicator = span('choice-indicator', '');
      indicator.setAttribute('aria-hidden', 'true');
      label.append(input, span('choice-letter', letters[optionIndex]), span('choice-text', option), indicator);
      return label;
    }));

    renderProgress();
    renderMark();
    prevButton.disabled = index === 0;
    textButton(nextButton, index === total - 1 ? 'Cek jawaban' : 'Selanjutnya');
  }

  function openQuestion(index) {
    if (saving) return;
    attempt.index = index;
    saveDraft();
    renderQuestion();
    showView('quiz');
    updateClock();
  }

  function navigationButton(index, className) {
    const answered = attempt.answers[index] !== null;
    const marked = attempt.marked[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.classList.toggle('is-answered', answered);
    button.classList.toggle('is-marked', marked);
    button.addEventListener('click', () => {
      closeDialog(gridDialog);
      openQuestion(index);
    });
    return button;
  }

  function openDialog(dialog) {
    if (dialog.hasAttribute('open')) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function closeDialog(dialog) {
    if (!dialog.hasAttribute('open')) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  function openGrid() {
    if (saving) return;
    const grid = byId('question-grid');
    grid.replaceChildren(...exam.questions.map((_, index) => {
      const button = navigationButton(index, 'grid-cell');
      const current = index === attempt.index;
      button.textContent = String(index + 1);
      button.classList.toggle('is-current', current);
      if (current) button.setAttribute('aria-current', 'true');
      const status = attempt.answers[index] === null ? 'belum dijawab' : 'terjawab';
      const flag = attempt.marked[index] ? ', ditandai' : '';
      button.setAttribute('aria-label', `Soal ${index + 1}, ${status}${flag}`);
      return button;
    }));
    openDialog(gridDialog);
    byId('grid-close').focus();
  }

  function renderReview() {
    if (saving) return;
    const empty = attempt.answers.filter((answer) => answer === null).length;
    const marked = attempt.marked.filter(Boolean).length;
    byId('review-summary').textContent = `${total - empty} terjawab · ${empty} kosong · ${marked} ditandai`;
    byId('review-list').replaceChildren(...exam.questions.map((_, index) => {
      const answer = attempt.answers[index];
      const flag = attempt.marked[index] ? ' · Ditandai' : '';
      const status = answer === null ? 'Belum dijawab' : `Jawaban ${letters[answer]}`;
      const button = navigationButton(index, 'review-item');
      button.append(span('review-number', `Soal ${index + 1}`), span('review-status', status + flag));
      return button;
    }));
    showView('review');
    updateClock();
  }

  function openConfirmation() {
    if (saving) return;
    const empty = attempt.answers.filter((answer) => answer === null).length;
    byId('confirm-message').textContent = empty
      ? `Masih ada ${empty} soal kosong. Jawaban kosong bernilai 0. Selesaikan tes sekarang?`
      : 'Semua soal sudah terjawab. Selesaikan tes dan lihat hasilmu?';
    openDialog(confirmDialog);
    byId('confirm-cancel').focus();
  }

  function readiness(score) {
    if (score >= 8) return ['Kesiapan lebih kuat', 'Kamu sudah punya bekal yang baik untuk memulai LKPD.'];
    if (score >= 5) return ['Perlu pengingat', 'Tinjau kembali bagian yang masih keliru bersama gurumu.'];
    return ['Perlu contoh dan bimbingan', 'Pelajari kembali contoh dasar proyeksi bersama gurumu sebelum mengerjakan LKPD.'];
  }

  function renderResult(moveFocus = true) {
    const [band, advice] = readiness(result.score);
    byId('result-name').textContent = `${result.studentName} · ${result.studentClass} · No. ${result.studentNumber}`;
    byId('result-score').textContent = result.score;
    byId('result-correct').textContent = result.correct;
    byId('result-incorrect').textContent = result.incorrect;
    byId('result-empty').textContent = result.unanswered;
    byId('result-duration').textContent = formatClock(result.durationSeconds);
    byId('result-band').textContent = band;
    byId('result-advice').textContent = advice;
    const prefix = result.timedOut ? 'Waktu habis. ' : '';
    byId('storage-note').textContent = prefix + (savedResult
      ? 'Hasil tersimpan di browser ini.'
      : 'Browser tidak dapat menyimpan hasil. Catat hasilnya sebelum menutup halaman.');
    showView('result', moveFocus);
  }

  async function finishAttempt(timedOut = false) {
    if (!attempt || saving || result) return;
    saving = true;
    clearInterval(timerId);
    submitButton.disabled = true;
    confirmSubmit.disabled = true;
    closeDialog(confirmDialog);
    closeDialog(gridDialog);

    const submittedAt = Date.now();
    const elapsed = elapsedSeconds();
    const durationSeconds = limit === null ? elapsed : Math.min(limit, elapsed);
    const answers = exam.questions.map((question, index) => {
      const answer = attempt.answers[index];
      return { questionId: question.id, choice: answer === null ? null : letters[answer], correct: answer === question.correct };
    });
    const correct = answers.filter((answer) => answer.correct).length;
    const unanswered = answers.filter((answer) => answer.choice === null).length;
    result = {
      examId: exam.id,
      attemptId: attempt.id,
      studentName: attempt.studentName,
      studentClass: attempt.studentClass,
      studentNumber: attempt.studentNumber,
      startedAt: new Date(attempt.startedAt).toISOString(),
      submittedAt: new Date(submittedAt).toISOString(),
      durationSeconds,
      timedOut: timedOut || (limit !== null && elapsed >= limit),
      score: correct,
      correct,
      incorrect: total - correct - unanswered,
      unanswered,
      total,
      answers
    };
    try {
      await persistSubmission(result);
      savedResult = true;
    } catch {
      savedResult = false;
    } finally {
      saving = false;
      submitButton.disabled = false;
      confirmSubmit.disabled = false;
      renderResult();
    }
  }

  fields.forEach((field) => field.addEventListener('input', () => field.setCustomValidity('')));
  startForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (attempt) {
      openQuestion(attempt.index);
      startClock();
      return;
    }

    const [studentName, studentClass, studentNumber] = fields.map((field) => field.value.trim());
    const blank = fields.find((field) => !field.value.trim());
    if (blank) {
      blank.setCustomValidity('Isi bagian ini untuk memulai tes.');
      blank.reportValidity();
      return;
    }
    attempt = {
      id: typeof window.crypto?.randomUUID === 'function' ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      studentName,
      studentClass,
      studentNumber,
      index: 0,
      startedAt: Date.now(),
      answers: Array(total).fill(null),
      marked: Array(total).fill(false)
    };
    openQuestion(0);
    startClock();
  });

  byId('question-options').addEventListener('change', (event) => {
    if (saving || event.target.name !== 'choice') return;
    updateClock();
    if (result) return;
    attempt.answers[attempt.index] = Number(event.target.value);
    Array.from(byId('question-options').children).forEach((choice, index) => {
      choice.classList.toggle('is-selected', index === attempt.answers[attempt.index]);
    });
    saveDraft();
    renderProgress();
  });
  markButton.addEventListener('click', () => {
    if (saving) return;
    attempt.marked[attempt.index] = !attempt.marked[attempt.index];
    saveDraft();
    renderMark();
  });
  prevButton.addEventListener('click', () => openQuestion(attempt.index - 1));
  nextButton.addEventListener('click', () => {
    if (attempt.index === total - 1) renderReview();
    else openQuestion(attempt.index + 1);
  });
  gridButton.addEventListener('click', openGrid);
  byId('grid-close').addEventListener('click', () => {
    closeDialog(gridDialog);
    gridButton.focus();
  });
  byId('grid-review').addEventListener('click', () => {
    closeDialog(gridDialog);
    renderReview();
  });
  byId('back-to-quiz').addEventListener('click', () => openQuestion(attempt.index));
  submitButton.addEventListener('click', openConfirmation);
  byId('confirm-cancel').addEventListener('click', () => {
    closeDialog(confirmDialog);
    submitButton.focus();
  });
  confirmSubmit.addEventListener('click', () => void finishAttempt());
  byId('restart-button').addEventListener('click', () => {
    try {
      if (readStored(draftKey)?.id === result.attemptId) localStorage.removeItem(draftKey);
    } catch {
      // The next attempt can still run in memory.
    }
    attempt = null;
    result = null;
    savedResult = false;
    startForm.reset();
    fields.forEach((field) => { field.readOnly = false; });
    textButton(startButton, 'Mulai tes');
    resumeNote.hidden = true;
    showView('home');
  });
  document.addEventListener('visibilitychange', updateClock);

  if (result) {
    renderResult(false);
  } else if (attempt) {
    const values = [attempt.studentName, attempt.studentClass, attempt.studentNumber];
    fields.forEach((field, index) => {
      field.value = values[index];
      field.readOnly = true;
    });
    resumeNote.textContent = 'Ada tes yang belum selesai di browser ini.';
    resumeNote.hidden = false;
    textButton(startButton, 'Lanjutkan tes');
  }
})();
