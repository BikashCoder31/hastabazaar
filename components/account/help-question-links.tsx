'use client';

import { useEffect } from 'react';

export function HelpQuestionLinks() {
  useEffect(() => {
    function openQuestion() {
      const question = document.getElementById(window.location.hash.slice(1));
      if (question instanceof HTMLDetailsElement && question.hasAttribute('data-help-question')) question.open = true;
    }
    openQuestion();
    window.addEventListener('hashchange', openQuestion);
    return () => window.removeEventListener('hashchange', openQuestion);
  }, []);
  return null;
}
