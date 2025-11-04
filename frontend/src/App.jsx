import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import './App.css';

const CONFIGURED_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function parseCsvText(text) {
  const rows = [];
  let currentValue = '';
  let currentRow = [];
  let inQuotes = false;

  const pushValue = () => {
    currentRow.push(currentValue.trim());
    currentValue = '';
  };

  const pushRow = () => {
    if (currentRow.length) {
      rows.push(currentRow);
    } else if (currentValue.trim().length) {
      rows.push([currentValue.trim()]);
    }
    currentRow = [];
    currentValue = '';
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      pushValue();
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      pushValue();
      pushRow();
    } else {
      currentValue += char;
    }
  }

  if (currentValue.length || currentRow.length) {
    pushValue();
    pushRow();
  }

  return rows.filter((row) => row.some((cell) => cell.length > 0));
}

function App() {
  const [user, setUser] = useState(null);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('vaai_token'));
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [busySlots, setBusySlots] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [autoSortLoading, setAutoSortLoading] = useState(false);
  const [autoSortResults, setAutoSortResults] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  const [actionToast, setActionToast] = useState(null);
  const [actionMetrics, setActionMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [feedbackLoadingId, setFeedbackLoadingId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [teamModal, setTeamModal] = useState(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    inviteEmail: '',
    inviteRole: 'member'
  });
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState(null);
  const [acceptingInvite, setAcceptingInvite] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState(null);
  const [followUpModal, setFollowUpModal] = useState(null);
  const [followUpActionId, setFollowUpActionId] = useState(null);
  const [meetingBriefs, setMeetingBriefs] = useState([]);
  const [meetingBriefLoading, setMeetingBriefLoading] = useState(false);
  const [meetingBriefError, setMeetingBriefError] = useState(null);
  const [meetingBriefModal, setMeetingBriefModal] = useState(null);
  const [meetingEventDetails, setMeetingEventDetails] = useState(null);
  const [meetingEditMode, setMeetingEditMode] = useState(false);
  const [meetingEditSaving, setMeetingEditSaving] = useState(false);
  const [meetingEditForm, setMeetingEditForm] = useState({
    summary: '',
    start: '',
    end: '',
    location: '',
    description: '',
    attendees: ''
  });
  const [meetingScope, setMeetingScope] = useState('team');
  const [meetingRangeDays, setMeetingRangeDays] = useState(7);
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(null);
  const [taskShowCompleted, setTaskShowCompleted] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    notes: '',
    due: ''
  });
  const [gmailForm, setGmailForm] = useState({
    to: '',
    subject: '',
    textBody: ''
  });
  const defaultDocDestinationFolder = import.meta.env.VITE_DEFAULT_DOCS_FOLDER_ID || '';
  const defaultDocTemplateFolder = import.meta.env.VITE_DEFAULT_DOC_TEMPLATE_FOLDER_ID || '';
  const defaultSheetsFolder = import.meta.env.VITE_DEFAULT_SHEETS_FOLDER_ID || '';

  const [docsForm, setDocsForm] = useState({
    title: '',
    content: '',
    contentFormat: (import.meta.env.VITE_DEFAULT_DOC_CONTENT_FORMAT || 'markdown'),
    templateId: '',
    folderId: defaultDocDestinationFolder
  });
  const [docsTemplateFolderId, setDocsTemplateFolderId] = useState(defaultDocTemplateFolder);
  const [docTemplateFolderInput, setDocTemplateFolderInput] = useState(defaultDocTemplateFolder);
  const [docTemplates, setDocTemplates] = useState([]);
  const [docTemplatesLoading, setDocTemplatesLoading] = useState(false);

  const [sheetsForm, setSheetsForm] = useState({
    spreadsheetId: '',
    range: '',
    valuesText: '',
    valueInputOption: 'USER_ENTERED'
  });
  const [sheetCatalogFolderId, setSheetCatalogFolderId] = useState(defaultSheetsFolder);
  const [sheetCatalogFolderInput, setSheetCatalogFolderInput] = useState(defaultSheetsFolder);
  const [sheetCatalog, setSheetCatalog] = useState([]);
  const [sheetCatalogLoading, setSheetCatalogLoading] = useState(false);
  const [reminderForm, setReminderForm] = useState({
    summary: '',
    start: '',
    durationMinutes: 30
  });
  const [automationLoading, setAutomationLoading] = useState({
    gmail: false,
    doc: false,
    sheet: false,
    reminder: false
  });
  const openTaskCount = useMemo(
    () => tasks.filter(task => task.status !== 'completed').length,
    [tasks]
  );
  const completedTaskCount = useMemo(
    () => tasks.filter(task => task.status === 'completed').length,
    [tasks]
  );
  const followUpPendingCount = useMemo(
    () => followUps.length,
    [followUps]
  );
  const meetingFilters = useMemo(() => [
    {
      id: 'upcoming',
      label: 'Upcoming',
      predicate: (brief) => !brief.calendarEventStart || new Date(brief.calendarEventStart).getTime() >= Date.now()
    },
    {
      id: 'today',
      label: 'Today',
      predicate: (brief) => {
        if (!brief.calendarEventStart) return false;
        const eventDate = new Date(brief.calendarEventStart);
        const now = new Date();
        return (
          eventDate.getFullYear() === now.getFullYear() &&
          eventDate.getMonth() === now.getMonth() &&
          eventDate.getDate() === now.getDate()
        );
      }
    },
    {
      id: 'needs-review',
      label: 'Needs review',
      predicate: (brief) => brief.status !== 'reviewed'
    },
    {
      id: 'reviewed',
      label: 'Reviewed',
      predicate: (brief) => brief.status === 'reviewed'
    },
    {
      id: 'all',
      label: 'All meetings',
      predicate: null
    }
  ], []);

  const selectedTemplate = useMemo(
    () => docTemplates.find((template) => template.id === docsForm.templateId),
    [docTemplates, docsForm.templateId]
  );

  const selectedSheet = useMemo(
    () => sheetCatalog.find((sheet) => sheet.id === sheetsForm.spreadsheetId),
    [sheetCatalog, sheetsForm.spreadsheetId]
  );

  const sheetPreview = useMemo(() => {
    if (!sheetsForm.valuesText.trim()) return [];
    try {
      return parseCsvText(sheetsForm.valuesText);
    } catch (error) {
      console.error('Failed to parse sheet values:', error);
      return [];
    }
  }, [sheetsForm.valuesText]);

  const [filteredMeetingBriefs, setFilteredMeetingBriefs] = useState([]);
  const upcomingMeetingCount = useMemo(
    () => filteredMeetingBriefs.length,
    [filteredMeetingBriefs]
  );
  const [meetingView, setMeetingView] = useState('upcoming');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMessages, setAssistantMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I can help summarise emails, schedule meetings, and prepare briefs. How can I help?'
    }
  ]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState(null);
  const toastTimeoutRef = useRef(null);
  const [newEvent, setNewEvent] = useState({
    summary: '',
    start: '',
    end: '',
    attendees: '',
    description: '',
    location: '',
    createMeetLink: false
  });
  const [subscriptionTiers, setSubscriptionTiers] = useState([]);
  const [subscriptionMeta, setSubscriptionMeta] = useState({ currency: 'USD', billingOptions: [] });
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState(null);

  useEffect(() => {
    if (CONFIGURED_API_BASE_URL) {
      axios.defaults.baseURL = CONFIGURED_API_BASE_URL;
    }
  }, [CONFIGURED_API_BASE_URL]);

  const baseApiUrl = CONFIGURED_API_BASE_URL || axios.defaults.baseURL || '';
  const workerBriefingsEnabled =
    import.meta.env.VITE_ENABLE_WORKER_BRIEFINGS === 'true';
  const briefingAvailable = useMemo(
    () =>
      !!baseApiUrl &&
      (!baseApiUrl.includes('workers.dev') || workerBriefingsEnabled),
    [baseApiUrl, workerBriefingsEnabled]
  );

  useEffect(() => {
    if (token) {
      fetchUserInfo();
    }
  }, [token]);

  useEffect(() => {
    const loadSubscriptionTiers = async () => {
      setSubscriptionLoading(true);
      setSubscriptionError(null);
      try {
        const response = await axios.get('/monetization/subscription-tiers');
        const tiers = response.data?.tiers || {};
        const preferredOrder = ['solo', 'business'];
        const normalized = Object.entries(tiers).map(([id, tier]) => ({
          id,
          name: tier.name,
          monthlyPrice: tier.monthly_price,
          annualPrice: tier.annual_price,
          seatsIncluded: tier.seats_included,
          bestFor: tier.best_for,
          highlights: Array.isArray(tier.highlights) ? tier.highlights : [],
          limits: tier.limits || {}
        }));
        normalized.sort((a, b) => {
          const indexA = preferredOrder.indexOf(a.id);
          const indexB = preferredOrder.indexOf(b.id);
          const safeA = indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA;
          const safeB = indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB;
          return safeA - safeB;
        });
        setSubscriptionTiers(normalized);
        setSubscriptionMeta({
          currency: response.data?.currency || 'USD',
          billingOptions: response.data?.billing_options || []
        });
      } catch (error) {
        console.error('Failed to load subscription tiers:', error);
        setSubscriptionError(error.response?.data?.error || 'Unable to load subscription plans right now.');
      } finally {
        setSubscriptionLoading(false);
      }
    };

    loadSubscriptionTiers();
  }, []);

  const refreshBriefing = async () => {
    if (!token || !briefingAvailable) {
      if (!briefingAvailable) {
        setBriefing(null);
        setBriefingError(null);
      }
      return;
    }

    setBriefingLoading(true);
    setBriefingError(null);
    try {
      const response = await axios.get('/api/briefing', {
        headers: getAuthHeaders()
      });
      setBriefing(response.data);
    } catch (error) {
      console.error('Failed to load briefing:', error);
      setBriefingError('Unable to load daily briefing right now.');
    } finally {
      setBriefingLoading(false);
    }
  };

  const showToast = (toast) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setActionToast(toast);
    if (!toast?.persistent) {
      toastTimeoutRef.current = setTimeout(() => {
        setActionToast(null);
        toastTimeoutRef.current = null;
      }, 5000);
    }
  };

  const dismissToast = () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setActionToast(null);
  };

  const loadDocTemplates = useCallback(
    async (folderOverride) => {
      if (!token) {
        setDocTemplates([]);
        return;
      }
      setDocTemplatesLoading(true);
      try {
        const response = await axios.get('/api/google/docs/templates', {
          headers: getAuthHeaders(),
          params: {
            folderId: folderOverride !== undefined ? folderOverride || undefined : docsTemplateFolderId || undefined
          }
        });
        setDocTemplates(Array.isArray(response.data?.files) ? response.data.files : []);
      } catch (error) {
        console.error('Failed to load document templates:', error);
        setDocTemplates([]);
        if (!error.response?.status || error.response.status >= 500) {
          showToast({ message: 'Unable to load document templates.', error: true });
        }
      } finally {
        setDocTemplatesLoading(false);
      }
    },
    [token, getAuthHeaders, docsTemplateFolderId]
  );

  const loadSheetCatalog = useCallback(
    async (folderOverride) => {
      if (!token) {
        setSheetCatalog([]);
        return;
      }
      setSheetCatalogLoading(true);
      try {
        const response = await axios.get('/api/google/sheets/list', {
          headers: getAuthHeaders(),
          params: {
            folderId: folderOverride !== undefined ? folderOverride || undefined : sheetCatalogFolderId || undefined
          }
        });
        setSheetCatalog(Array.isArray(response.data?.files) ? response.data.files : []);
      } catch (error) {
        console.error('Failed to load spreadsheets:', error);
        setSheetCatalog([]);
        if (!error.response?.status || error.response.status >= 500) {
          showToast({ message: 'Unable to load spreadsheets.', error: true });
        }
      } finally {
        setSheetCatalogLoading(false);
      }
    },
    [token, getAuthHeaders, sheetCatalogFolderId]
  );

  const applyTemplateFolder = useCallback(() => {
    const trimmed = docTemplateFolderInput.trim();
    setDocsTemplateFolderId(trimmed);
    loadDocTemplates(trimmed);
  }, [docTemplateFolderInput, loadDocTemplates]);

  const applySheetFolder = useCallback(() => {
    const trimmed = sheetCatalogFolderInput.trim();
    setSheetCatalogFolderId(trimmed);
    loadSheetCatalog(trimmed);
  }, [sheetCatalogFolderInput, loadSheetCatalog]);

  const updateBriefingItem = (emailId, updater) => {
    setBriefing(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map(item => (
          item.emailId === emailId ? updater(item) : item
        ))
      };
    });
  };

  useEffect(() => () => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!token) {
      setDocTemplates([]);
      setSheetCatalog([]);
      return;
    }
    loadDocTemplates(docsTemplateFolderId);
    loadSheetCatalog(sheetCatalogFolderId);
  }, [token, docsTemplateFolderId, sheetCatalogFolderId, loadDocTemplates, loadSheetCatalog]);

  useEffect(() => {
    setDocTemplateFolderInput(docsTemplateFolderId);
  }, [docsTemplateFolderId]);

  useEffect(() => {
    setSheetCatalogFolderInput(sheetCatalogFolderId);
  }, [sheetCatalogFolderId]);

  useEffect(() => {
    if (!sheetsForm.spreadsheetId && sheetCatalog.length > 0) {
      setSheetsForm((prev) => ({
        ...prev,
        spreadsheetId: prev.spreadsheetId || sheetCatalog[0].id
      }));
    }
  }, [sheetCatalog, sheetsForm.spreadsheetId]);

  const getAuthHeaders = useCallback(() => {
    const headers = {
      Authorization: `Bearer ${token}`
    };
    if (activeTeamId) {
      headers['X-Team-Id'] = activeTeamId;
    }
    return headers;
  }, [token, activeTeamId]);

  const syncTeamsState = (fetchedTeams) => {
    setTeams(fetchedTeams);
    if (fetchedTeams.length > 0) {
      setActiveTeamId(prev => {
        if (!prev) return fetchedTeams[0].id;
        return fetchedTeams.some(team => team.id === prev) ? prev : fetchedTeams[0].id;
      });
    } else {
      setActiveTeamId(null);
    }
  };

  const fetchTeams = async () => {
    if (!token) {
      return;
    }

    setTeamLoading(true);
    setTeamError(null);
    try {
      const response = await axios.get('/api/teams', {
        headers: getAuthHeaders()
      });
      const fetchedTeams = Array.isArray(response.data.teams) ? response.data.teams : [];
      syncTeamsState(fetchedTeams);
    } catch (error) {
      console.error('Failed to load teams:', error);
      setTeamError('Unable to load teams right now.');
    } finally {
      setTeamLoading(false);
    }
  };

  const handleTeamModalOpen = (type) => {
    setTeamError(null);
    if (type === 'create') {
      setTeamForm({
        name: '',
        inviteEmail: '',
        inviteRole: 'member'
      });
    } else if (type === 'invite') {
      setTeamForm(prev => ({
        ...prev,
        inviteEmail: '',
        inviteRole: 'member'
      }));
    }
    setTeamModal({ type });
  };

  const handleTeamModalClose = () => {
    setTeamModal(null);
    setTeamError(null);
    setTeamLoading(false);
  };

  const handleTeamFormChange = (field, value) => {
    setTeamForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateTeam = async (event) => {
    event?.preventDefault();
    if (!token) return;

    const trimmedName = teamForm.name.trim();
    if (!trimmedName) {
      setTeamError('Team name is required.');
      return;
    }

    setTeamLoading(true);
    setTeamError(null);

    try {
      await axios.post(
        '/api/teams',
        { name: trimmedName },
        { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
      );

      showToast({ message: `Team "${trimmedName}" created.` });
      await fetchTeams();
      handleTeamModalClose();
    } catch (error) {
      console.error('Failed to create team:', error);
      setTeamError(error.response?.data?.error || 'Unable to create team.');
    } finally {
      setTeamLoading(false);
    }
  };

  const handleInviteMember = async (event) => {
    event?.preventDefault();
    if (!token) return;

    if (!activeTeamId) {
      setTeamError('Select a team before inviting members.');
      return;
    }

    const trimmedEmail = teamForm.inviteEmail.trim();
    if (!trimmedEmail) {
      setTeamError('Email is required.');
      return;
    }

    setTeamLoading(true);
    setTeamError(null);

    try {
      await axios.post(
        `/api/teams/${activeTeamId}/invite`,
        { email: trimmedEmail, role: teamForm.inviteRole },
        { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
      );

      showToast({ message: `Invitation sent to ${trimmedEmail}.` });
      handleTeamModalClose();
    } catch (error) {
      console.error('Failed to send invitation:', error);
      setTeamError(error.response?.data?.error || 'Unable to send invitation.');
    } finally {
      setTeamLoading(false);
    }
  };

  const acceptTeamInvitation = async (tokenValue) => {
    if (!token || !tokenValue) return;

    setAcceptingInvite(true);
    try {
      await axios.post(
        '/api/teams/invitations/accept',
        { token: tokenValue },
        { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
      );
      showToast({ message: 'Invitation accepted. Welcome to the team!' });
      await fetchTeams();
    } catch (error) {
      console.error('Failed to accept team invitation:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to accept invitation.',
        error: true,
        persistent: true
      });
    } finally {
      setAcceptingInvite(false);
    }
  };

  const handleTeamSelect = (event) => {
    const value = event.target.value ? Number(event.target.value) : null;
    setActiveTeamId(value);
  };

  const fetchFollowUps = async () => {
    if (!token || !activeTeamId) {
      setFollowUps([]);
      return;
    }

    setFollowUpLoading(true);
    setFollowUpError(null);
    try {
      const response = await axios.get('/api/follow-ups', {
        headers: getAuthHeaders()
      });
      setFollowUps(Array.isArray(response.data.tasks) ? response.data.tasks : []);
    } catch (error) {
      console.error('Failed to load follow-ups:', error);
      setFollowUpError(error.response?.data?.error || 'Unable to load follow-up queue right now.');
    } finally {
      setFollowUpLoading(false);
    }
  };

  const openFollowUpModal = (task) => {
    setFollowUpModal({
      task,
      subject: task.draftSubject || task.subject || '',
      body: task.draftBody || '',
      sendAt: formatDateTimeLocal(task.suggestedSendAt ? new Date(task.suggestedSendAt) : new Date(Date.now() + 15 * 60 * 1000))
    });
  };

  const closeFollowUpModal = () => {
    setFollowUpModal(null);
    setFollowUpActionId(null);
  };

  const submitFollowUpApproval = async (event) => {
    event?.preventDefault();
    if (!followUpModal) return;

    const { task, subject, body, sendAt } = followUpModal;
    const payload = {
      draftSubject: subject,
      draftBody: body,
      sendAt: sendAt ? new Date(sendAt).toISOString() : new Date().toISOString()
    };

    setFollowUpActionId(task.id);
    try {
      await axios.post(`/api/follow-ups/${task.id}/approve`, payload, {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
      showToast({ message: 'Follow-up scheduled.' });
      closeFollowUpModal();
      fetchFollowUps();
    } catch (error) {
      console.error('Failed to approve follow-up:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to approve follow-up.',
        error: true,
        persistent: true
      });
    } finally {
      setFollowUpActionId(null);
    }
  };

  const handleFollowUpSnooze = async (task, minutes) => {
    setFollowUpActionId(task.id);
    try {
      await axios.post(`/api/follow-ups/${task.id}/snooze`, { minutes }, {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });
      showToast({ message: `Snoozed for ${minutes} minutes.` });
      fetchFollowUps();
    } catch (error) {
      console.error('Failed to snooze follow-up:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to snooze follow-up.',
        error: true,
        persistent: true
      });
    } finally {
      setFollowUpActionId(null);
    }
  };

  const handleFollowUpDismiss = async (task) => {
    setFollowUpActionId(task.id);
    try {
      await axios.post(`/api/follow-ups/${task.id}/dismiss`, {}, {
        headers: getAuthHeaders()
      });
      showToast({ message: 'Follow-up dismissed.' });
      fetchFollowUps();
    } catch (error) {
      console.error('Failed to dismiss follow-up:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to dismiss follow-up.',
        error: true,
        persistent: true
      });
    } finally {
      setFollowUpActionId(null);
    }
  };

  const handleFollowUpRegenerate = async (task) => {
    setFollowUpActionId(task.id);
    try {
      const response = await axios.post(`/api/follow-ups/${task.id}/regenerate`, {}, {
        headers: getAuthHeaders()
      });
      if (response.data?.task) {
        setFollowUps(prev =>
          prev.map(item => (item.id === task.id ? response.data.task : item))
        );
      }
      showToast({ message: 'Draft refreshed.' });
    } catch (error) {
      console.error('Failed to regenerate draft:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to regenerate draft.',
        error: true,
        persistent: true
      });
    } finally {
      setFollowUpActionId(null);
    }
  };

  const fetchTasks = useCallback(async () => {
    if (!token) {
      setTasks([]);
      return;
    }

    setTasksLoading(true);
    setTasksError(null);
    try {
      const response = await axios.get('/api/google/tasks', {
        headers: getAuthHeaders(),
        params: {
          showCompleted: taskShowCompleted,
          maxResults: 50
        }
      });
      setTasks(Array.isArray(response.data.tasks) ? response.data.tasks : []);
    } catch (error) {
      console.error('Failed to load Google Tasks:', error);
      setTasksError(error.response?.data?.error || 'Unable to load tasks right now.');
    } finally {
      setTasksLoading(false);
    }
  }, [token, taskShowCompleted, getAuthHeaders]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleTaskFormChange = (field, value) => {
    setTaskForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleTaskSubmit = async (event) => {
    event.preventDefault();
    if (!taskForm.title.trim()) {
      showToast({ message: 'A task title is required.', error: true });
      return;
    }

    if (!token) {
      showToast({ message: 'Please sign in to add tasks.', error: true });
      return;
    }

    setTaskSubmitting(true);
    setTasksError(null);

    try {
      const payload = {
        title: taskForm.title.trim()
      };

      if (taskForm.notes?.trim()) {
        payload.notes = taskForm.notes.trim();
      }

      const dueIso = convertLocalToISO(taskForm.due);
      if (dueIso) {
        payload.due = dueIso;
      }

      await axios.post(
        '/api/google/tasks',
        payload,
        {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );

      setTaskForm({ title: '', notes: '', due: '' });
      fetchTasks();
      showToast({ message: 'Task added.' });
    } catch (error) {
      console.error('Failed to create task:', error);
      setTasksError(error.response?.data?.error || 'Unable to create task right now.');
    } finally {
      setTaskSubmitting(false);
    }
  };

  const handleCompleteTask = async (taskId) => {
    if (!token || !taskId) return;

    try {
      await axios.post(
        `/api/google/tasks/${taskId}/complete`,
        {},
        { headers: getAuthHeaders() }
      );
      fetchTasks();
    } catch (error) {
      console.error('Failed to complete task:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to complete the task.',
        error: true
      });
    }
  };

  const toggleAutomationLoading = (key, value) => {
    setAutomationLoading(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSendGmail = async (event) => {
    event.preventDefault();
    if (!token) {
      showToast({ message: 'Connect Google to send email.', error: true });
      return;
    }
    if (!gmailForm.to || !gmailForm.subject || !gmailForm.textBody) {
      showToast({ message: 'To, subject, and message are required.', error: true });
      return;
    }
    toggleAutomationLoading('gmail', true);
    try {
      await axios.post(
        '/api/gmail/compose/send',
        {
          ...gmailForm,
          textBody: gmailForm.textBody.trim()
        },
        {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );
      showToast({ message: 'Email sent via Gmail.' });
      setGmailForm({ to: '', subject: '', textBody: '' });
    } catch (error) {
      console.error('Failed to send Gmail:', error);
      showToast({
        message: error.response?.data?.message || 'Unable to send email.',
        error: true,
        persistent: true
      });
    } finally {
      toggleAutomationLoading('gmail', false);
    }
  };

  const handleCreateDoc = async (event) => {
    event.preventDefault();
    if (!token) {
      showToast({ message: 'Connect Google to create Docs.', error: true });
      return;
    }
    if (!docsForm.title.trim()) {
      showToast({ message: 'Document title is required.', error: true });
      return;
    }
    toggleAutomationLoading('doc', true);
    try {
      const payload = {
        title: docsForm.title.trim(),
        content: docsForm.content?.trim() || undefined,
        contentFormat: docsForm.contentFormat || 'markdown',
        templateDocumentId: docsForm.templateId || undefined,
        folderId: docsForm.folderId?.trim() || undefined
      };

      const response = await axios.post(
        '/api/google/docs',
        payload,
        {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );
      const docInfo = response.data?.document;
      const link = docInfo?.documentLink;
      const docTitle = docInfo?.title || docsForm.title.trim();

      showToast({
        message: link ? `Google Doc "${docTitle}" ready to edit.` : 'Google Doc created.',
        persistent: false,
        action: link
          ? {
              label: 'Open Doc',
              onClick: () => window.open(link, '_blank', 'noopener')
            }
          : undefined
      });
      setDocsForm((prev) => ({
        ...prev,
        title: '',
        content: ''
      }));
      if (link) {
        window.open(link, '_blank', 'noopener');
      }
    } catch (error) {
      console.error('Failed to create Google Doc:', error);
      showToast({
        message: error.response?.data?.message || 'Unable to create document.',
        error: true
      });
    } finally {
      toggleAutomationLoading('doc', false);
    }
  };

  const handleAppendSheet = async (event) => {
    event.preventDefault();
    if (!token) {
      showToast({ message: 'Connect Google to update Sheets.', error: true });
      return;
    }
    if (!sheetsForm.spreadsheetId.trim() || !sheetsForm.range.trim() || !sheetsForm.valuesText.trim()) {
      showToast({ message: 'Spreadsheet ID, range, and values are required.', error: true });
      return;
    }
    const values = sheetPreview;
    if (!values.length) {
      showToast({ message: 'Enter at least one row of values.', error: true });
      return;
    }
    toggleAutomationLoading('sheet', true);
    try {
      await axios.post(
        '/api/google/sheets/append',
        {
          spreadsheetId: sheetsForm.spreadsheetId.trim(),
          range: sheetsForm.range.trim(),
          values,
          valueInputOption: sheetsForm.valueInputOption || 'USER_ENTERED'
        },
        {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );
      const sheetInfo = sheetCatalog.find(item => item.id === sheetsForm.spreadsheetId.trim());
      showToast({
        message: 'Rows appended to Google Sheet.',
        action: sheetInfo?.webViewLink
          ? {
              label: 'Open Sheet',
              onClick: () => window.open(sheetInfo.webViewLink, '_blank', 'noopener')
            }
          : undefined
      });
      setSheetsForm(prev => ({
        ...prev,
        valuesText: ''
      }));
    } catch (error) {
      console.error('Failed to append Google Sheet rows:', error);
      showToast({
        message: error.response?.data?.message || 'Unable to append rows.',
        error: true
      });
    } finally {
      toggleAutomationLoading('sheet', false);
    }
  };

  const handleCreateReminder = async (event) => {
    event.preventDefault();
    if (!token) {
      showToast({ message: 'Connect Google to schedule reminders.', error: true });
      return;
    }
    if (!reminderForm.summary.trim()) {
      showToast({ message: 'Reminder title is required.', error: true });
      return;
    }
    toggleAutomationLoading('reminder', true);
    try {
      await axios.post(
        '/api/calendar/reminders/time-block',
        {
          summary: reminderForm.summary.trim(),
          start: reminderForm.start || new Date().toISOString(),
          durationMinutes: Number.parseInt(reminderForm.durationMinutes, 10) || 30
        },
        {
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          }
        }
      );
      showToast({ message: 'Calendar reminder created.' });
      setReminderForm({ summary: '', start: '', durationMinutes: 30 });
    } catch (error) {
      console.error('Failed to create calendar reminder:', error);
      showToast({
        message: error.response?.data?.message || 'Unable to create reminder.',
        error: true
      });
    } finally {
      toggleAutomationLoading('reminder', false);
    }
  };

  const fetchMeetingBriefs = async () => {
    if (!token || !activeTeamId || !briefingAvailable) {
      setMeetingBriefs([]);
      setMeetingEventDetails(null);
      setMeetingEditMode(false);
      if (!briefingAvailable) {
        setMeetingBriefError(null);
        setMeetingBriefLoading(false);
      }
      return;
    }

    setMeetingBriefLoading(true);
    setMeetingBriefError(null);
    try {
      const response = await axios.get('/api/meeting-briefs', {
        headers: getAuthHeaders(),
        params: {
          scope: meetingScope,
          days: meetingRangeDays
        }
      });
      const briefs = Array.isArray(response.data.briefs) ? response.data.briefs : [];
      const meetingFilter = meetingFilters.find(filter => filter.id === meetingView);
      const filtered = meetingFilter?.predicate
        ? briefs.filter(meetingFilter.predicate)
        : briefs;
      setMeetingBriefs(briefs);
      setFilteredMeetingBriefs(filtered);
    } catch (error) {
      console.error('Failed to load meeting briefs:', error);
      setMeetingBriefError(error.response?.data?.error || 'Unable to load meeting prep right now.');
    } finally {
      setMeetingBriefLoading(false);
    }
  };

  const openMeetingBriefModal = (brief) => {
    setMeetingBriefModal({
      ...brief,
      metadata: brief.metadata || {}
    });
  };

  const closeMeetingBriefModal = () => {
    setMeetingBriefModal(null);
  };

  const openMeetingDetailsPanel = (brief) => {
    const details = {
      ...brief,
      metadata: brief.metadata || {}
    };
    setMeetingEventDetails(details);
    setMeetingEditMode(false);
    setMeetingEditSaving(false);
    setMeetingEditForm(buildMeetingEditDefaults(details));
  };

  const closeMeetingDetailsPanel = () => {
    setMeetingEventDetails(null);
    setMeetingEditMode(false);
    setMeetingEditSaving(false);
    setMeetingEditForm(buildMeetingEditDefaults(null));
  };

  const beginMeetingEdit = () => {
    if (!meetingEventDetails) return;
    if (!calendarEvents.length) {
      fetchCalendarEvents();
    }
    setMeetingEditForm(buildMeetingEditDefaults(meetingEventDetails));
    setMeetingEditMode(true);
  };

  const handleMeetingEditChange = (field, value) => {
    setMeetingEditForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCancelMeetingEdit = () => {
    if (meetingEventDetails) {
      setMeetingEditForm(buildMeetingEditDefaults(meetingEventDetails));
    }
    setMeetingEditMode(false);
    setMeetingEditSaving(false);
  };

  const handleMeetingEditSubmit = async (event) => {
    event.preventDefault();
    if (!meetingEventDetails) return;

    const summaryTrimmed = meetingEditForm.summary.trim();
    if (!summaryTrimmed) {
      showToast({
        message: 'Event title cannot be empty.',
        error: true
      });
      return;
    }

    const payload = {
      summary: summaryTrimmed
    };

    const startIso = convertLocalToISO(meetingEditForm.start);
    if (startIso) {
      payload.start = startIso;
    }

    const endIso = convertLocalToISO(meetingEditForm.end);
    if (endIso) {
      payload.end = endIso;
    }

    if (meetingEditForm.location !== undefined) {
      payload.location = meetingEditForm.location.trim();
    }

    if (meetingEditForm.description !== undefined) {
      payload.description = meetingEditForm.description.trim();
    }

    const attendeeList = meetingEditForm.attendees
      .split(',')
      .map(email => email.trim())
      .filter(Boolean);

    if (attendeeList.length) {
      payload.attendees = attendeeList;
    }

    setMeetingEditSaving(true);
    try {
      const response = await axios.patch(
        `/api/calendar/events/${meetingEventDetails.calendarEventId}`,
        payload,
        { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
      );

      const updatedEvent = response.data?.event;

      if (updatedEvent) {
        const updatedDetails = {
          ...meetingEventDetails,
          summary: updatedEvent.summary || meetingEventDetails.summary,
          calendarEventStart:
            updatedEvent.start?.dateTime ||
            updatedEvent.start?.date ||
            meetingEventDetails.calendarEventStart,
          metadata: {
            ...meetingEventDetails.metadata,
            location: updatedEvent.location ?? meetingEventDetails.metadata?.location ?? '',
            hangoutLink:
              updatedEvent.hangoutLink ||
              updatedEvent.conferenceData?.entryPoints?.[0]?.uri ||
              meetingEventDetails.metadata?.hangoutLink ||
              null,
            htmlLink: updatedEvent.htmlLink || meetingEventDetails.metadata?.htmlLink || null,
            attendees: normalizeEventAttendees(updatedEvent.attendees)
          }
        };

        setMeetingEventDetails(updatedDetails);
        setMeetingEditForm(buildMeetingEditDefaults(updatedDetails));
      }

      setMeetingEditMode(false);
      showToast({ message: 'Calendar event updated.' });
      fetchMeetingBriefs();
      fetchCalendarEvents();
    } catch (error) {
      console.error('Failed to update calendar event:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to update calendar event.',
        error: true,
        persistent: true
      });
    } finally {
      setMeetingEditSaving(false);
    }
  };

  const toggleAssistant = () => {
    setAssistantOpen((prev) => !prev);
    setAssistantError(null);
  };

  const appendAssistantMessage = (message) => {
    setAssistantMessages((prev) => [...prev, message]);
  };

  const handleAssistantSubmit = async (event) => {
    event.preventDefault();
    if (!assistantInput.trim() || assistantLoading) {
      return;
    }

    if (!token) {
      setAssistantError('Please sign in to use the assistant.');
      return;
    }

    const text = assistantInput.trim();
    appendAssistantMessage({ role: 'user', content: text });
    setAssistantInput('');
    setAssistantLoading(true);
    setAssistantError(null);

    try {
      const response = await axios.post(
        '/api/assistant',
        { message: text },
        { headers: getAuthHeaders() }
      );

      const reply = response.data?.reply || 'I am not sure how to help with that yet.';
      const eventData = response.data?.event || null;
      const taskData = response.data?.task || null;

      appendAssistantMessage({
        role: 'assistant',
        content: reply,
        event: eventData,
        task: taskData
      });

      if (response.data?.eventCreated) {
        fetchCalendarEvents();
        fetchMeetingBriefs();
      }

      if (response.data?.taskCreated) {
        fetchTasks();
        showToast({ message: 'Reminder added to Google Tasks.' });
      }
    } catch (error) {
      console.error('Assistant failed:', error);
      setAssistantError(error.response?.data?.error || 'Assistant is unavailable right now.');
      appendAssistantMessage({
        role: 'assistant',
        content: 'Something went wrong on my side. Please try again in a moment.'
      });
    } finally {
      setAssistantLoading(false);
      setAssistantOpen(true);
    }
  };

  const handleMeetingBriefStatus = async (brief, status) => {
    if (!token || !briefingAvailable) return;
    try {
      await axios.patch(
        `/api/meeting-briefs/${brief.id}`,
        { status },
        { headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' } }
      );
      showToast({ message: status === 'reviewed' ? 'Brief marked as reviewed.' : 'Brief updated.' });
      fetchMeetingBriefs();
    } catch (error) {
      console.error('Failed to update meeting brief:', error);
      showToast({
        message: error.response?.data?.error || 'Unable to update meeting brief.',
        error: true,
        persistent: true
      });
    }
  };

  const fetchActionMetrics = async (days = 7) => {
    if (!token || !briefingAvailable) {
      if (!briefingAvailable) {
        setActionMetrics(null);
      }
      return;
    }

    setMetricsLoading(true);
    setMetricsError(null);

    try {
      const response = await axios.get('/api/actions/metrics', {
        headers: getAuthHeaders(),
        params: { days }
      });
      setActionMetrics(response.data);
    } catch (error) {
      console.error('Failed to load assistant metrics:', error);
      setMetricsError('Unable to load assistant metrics right now.');
    } finally {
      setMetricsLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !activeTeamId || !briefingAvailable) {
      setActionMetrics(null);
      return;
    }
    fetchActionMetrics();
  }, [token, activeTeamId, briefingAvailable]);

  useEffect(() => {
    if (token && activeTeamId) {
      fetchFollowUps();
    } else {
      setFollowUps([]);
    }
  }, [token, activeTeamId]);

  useEffect(() => {
    if (token && activeTeamId && briefingAvailable) {
      fetchMeetingBriefs();
    } else {
      setMeetingBriefs([]);
      setFilteredMeetingBriefs([]);
      setMeetingEventDetails(null);
      setMeetingEditMode(false);
    }
  }, [token, activeTeamId, meetingScope, meetingRangeDays, briefingAvailable]);

  useEffect(() => {
    const meetingFilter = meetingFilters.find(filter => filter.id === meetingView);
    const filtered = meetingFilter?.predicate
      ? meetingBriefs.filter(meetingFilter.predicate)
      : meetingBriefs;
    setFilteredMeetingBriefs(filtered);
  }, [meetingView, meetingBriefs, meetingFilters]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (inviteToken) {
      acceptTeamInvitation(inviteToken);
      params.delete('invite');
      const newQuery = params.toString();
      const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [token]);

  const handleBriefingAction = async (item, action) => {
    if (!token || !briefingAvailable) return;

    const payload = {
      emailId: item.emailId,
      threadId: item.threadId,
      ...(action.payload || {})
    };

    const loadingKey = `${item.emailId}:${action.type}`;
    setActionLoadingId(loadingKey);

    try {
      if (action.type === 'draft_reply') {
        const response = await axios.post('/api/actions/draft-reply', payload, {
          headers: getAuthHeaders()
        });

        const { actionId, draft } = response.data;
        updateBriefingItem(item.emailId, existing => {
          const previous = existing.lastAction || {};
          return {
            ...existing,
            lastAction: {
              ...previous,
              actionId,
              actionType: action.type,
              status: 'completed',
              timestamp: new Date().toISOString()
            }
          };
        });

        setActionModal({
          type: 'draft_reply',
          actionId,
          draft,
          email: item
        });

        showToast({
          message: 'Reply drafted. Review before sending.',
          actionId,
          emailId: item.emailId,
          actionType: action.type,
          undoAvailable: true
        });

        fetchActionMetrics();
      } else if (action.type === 'schedule_meeting') {
        const response = await axios.post('/api/actions/schedule-meeting', payload, {
          headers: getAuthHeaders()
        });

        const { actionId, suggestions } = response.data;
        updateBriefingItem(item.emailId, existing => {
          const previous = existing.lastAction || {};
          return {
            ...existing,
            lastAction: {
              ...previous,
              actionId,
              actionType: action.type,
              status: 'awaiting_confirmation',
              timestamp: new Date().toISOString()
            }
          };
        });

        setActionModal({
          type: 'schedule_meeting',
          actionId,
          suggestions,
          email: item
        });

        showToast({
          message: suggestions.length
            ? 'Meeting times suggested.'
            : 'No open times were available.',
          actionId: suggestions.length ? actionId : undefined,
          emailId: item.emailId,
          actionType: action.type,
          undoAvailable: suggestions.length > 0,
          persistent: !suggestions.length
        });

        fetchActionMetrics();
      } else if (action.type === 'mark_handled') {
        const response = await axios.post('/api/actions/mark-handled', payload, {
          headers: getAuthHeaders()
        });

        const { actionId } = response.data;
        updateBriefingItem(item.emailId, existing => {
          const previous = existing.lastAction || {};
          return {
            ...existing,
            lastAction: {
              ...previous,
              actionId,
              actionType: action.type,
              status: 'completed',
              timestamp: new Date().toISOString()
            },
            handled: true
          };
        });

        showToast({
          message: 'Email marked as handled.',
          actionId,
          emailId: item.emailId,
          actionType: action.type,
          undoAvailable: true
        });

        fetchActionMetrics();
      } else {
        showToast({
          message: `Action "${action.type}" is not supported yet.`,
          error: true,
          persistent: true
        });
      }
    } catch (error) {
      console.error('Briefing action failed:', error);
      showToast({
        message: 'Failed to perform action. Check console for details.',
        error: true,
        persistent: true
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUndoAction = async (toastInfo) => {
    if (!briefingAvailable || !token) {
      dismissToast();
      return;
    }
    if (!toastInfo?.actionId) {
      dismissToast();
      return;
    }

    try {
      await axios.post(`/api/actions/${toastInfo.actionId}/undo`, {}, {
        headers: getAuthHeaders()
      });

      if (toastInfo.emailId) {
        updateBriefingItem(toastInfo.emailId, existing => ({
          ...existing,
          lastAction: existing.lastAction
            ? { ...existing.lastAction, status: 'undone', undoneAt: new Date().toISOString() }
            : existing.lastAction,
          handled: toastInfo.actionType === 'mark_handled' ? false : existing.handled
        }));
      }

      showToast({
        message: 'Action undone.',
        persistent: false
      });

      fetchActionMetrics();
    } catch (error) {
      console.error('Undo action failed:', error);
      showToast({
        message: 'Unable to undo action.',
        error: true,
        persistent: true
      });
    }
  };

  const handleActionFeedback = async ({ actionId, emailId, rating, note }) => {
    if (!token || !actionId || !rating || !briefingAvailable) {
      return;
    }

    setFeedbackLoadingId(actionId);

    try {
      await axios.post(`/api/actions/${actionId}/feedback`, {
        rating,
        note
      }, {
        headers: getAuthHeaders()
      });

      if (emailId) {
        updateBriefingItem(emailId, existing => ({
          ...existing,
          lastAction: existing.lastAction
            ? {
                ...existing.lastAction,
                feedback: {
                  rating,
                  note: note || null
                }
              }
            : existing.lastAction
        }));
      }

      showToast({
        message: rating === 'helpful' ? 'Marked as helpful. Thanks!' : 'Feedback saved. Thank you!',
        persistent: false
      });

      fetchActionMetrics();
    } catch (error) {
      console.error('Action feedback failed:', error);
      showToast({
        message: 'Unable to record feedback right now.',
        error: true,
        persistent: true
      });
    } finally {
      setFeedbackLoadingId(null);
    }
  };

  const closeActionModal = () => {
    setActionModal(null);
  };

  const copyToClipboard = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast({
        message: 'Copied to clipboard.'
      });
    } catch (error) {
      console.error('Copy failed:', error);
      showToast({
        message: 'Unable to copy to clipboard.',
        error: true,
        persistent: true
      });
    }
  };

  const formatDateTimeLocal = (date) => {
    const pad = (value) => value.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  useEffect(() => {
    if (user) {
      const defaultStart = new Date();
      defaultStart.setHours(defaultStart.getHours() + 1, 0, 0, 0);
      const defaultEnd = new Date(defaultStart.getTime() + 30 * 60 * 1000);
      
      setNewEvent(prev => ({
        ...prev,
        start: formatDateTimeLocal(defaultStart),
        end: formatDateTimeLocal(defaultEnd)
      }));

      refreshBriefing();
    }
  }, [user]);

  const fetchUserInfo = async () => {
    try {
      const response = await axios.get('/auth/me', {
        headers: getAuthHeaders()
      });
      setUser(response.data.user);
      const fetchedTeams = Array.isArray(response.data.teams) ? response.data.teams : [];
      syncTeamsState(fetchedTeams);
    } catch (error) {
      console.error('Failed to fetch user info:', error);
      localStorage.removeItem('vaai_token');
      setToken(null);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const response = await axios.get('/auth/google');
      window.location.href = response.data.authUrl;
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/emails', {
        headers: getAuthHeaders()
      });
      setEmails(response.data.emails);
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const classifyEmails = async () => {
    if (emails.length === 0) return;
    
    setLoading(true);
    try {
      const emailIds = emails.map(email => email.id);
      const response = await axios.post('/api/emails/classify', 
        { emailIds },
        { headers: getAuthHeaders() }
      );
      
      console.log('Classification results:', response.data.results);
      alert('Emails classified! Check console for results.');
    } catch (error) {
      console.error('Failed to classify emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const autoSortInbox = async () => {
    setAutoSortLoading(true);
    try {
      const response = await axios.post('/api/emails/auto-sort', {
        limit: 10
      }, {
        headers: getAuthHeaders()
      });

      setAutoSortResults(response.data.results || []);
      if (!emails.length) {
        fetchEmails();
      }
    } catch (error) {
      console.error('Failed to auto-sort emails:', error);
      alert('Auto-sort failed. Check console for details.');
    } finally {
      setAutoSortLoading(false);
    }
  };

  const fetchCalendarEvents = async () => {
    setCalendarLoading(true);
    try {
      const response = await axios.get('/api/calendar/events', {
        headers: getAuthHeaders()
      });
      setCalendarEvents(response.data.events || []);
    } catch (error) {
      console.error('Failed to fetch calendar events:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const fetchAvailability = async () => {
    setCalendarLoading(true);
    try {
      const response = await axios.get('/api/calendar/availability', {
        headers: getAuthHeaders()
      });
      setBusySlots(response.data.busy || []);
    } catch (error) {
      console.error('Failed to fetch availability:', error);
    } finally {
      setCalendarLoading(false);
    }
  };

  const handleNewEventChange = (field, value) => {
    setNewEvent(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const formatEventTime = (time) => {
    if (!time) return 'No time set';
    const value = time.dateTime || time.date;
    if (!value) return 'No time set';
    return new Date(value).toLocaleString();
  };

  const formatBusyWindow = (slot) => {
    if (!slot?.start || !slot?.end) return 'Unavailable';
    const startLabel = new Date(slot.start).toLocaleString();
    const endLabel = new Date(slot.end).toLocaleString();
    return `${startLabel} -> ${endLabel}`;
  };

  const parseLines = (text) =>
    text ? text.split('\n').map(line => line.trim()).filter(Boolean) : [];

  const formatAttendeesList = (attendees = []) =>
    attendees
      .map(att => att.displayName || att.email)
      .filter(Boolean)
      .join(', ');

  const formatRelativeTime = (iso) => {
    if (!iso) return 'No reminder set';
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return 'No reminder set';
    const diffMs = target - Date.now();
    const diffMinutes = Math.round(Math.abs(diffMs) / 60000);
    if (diffMinutes < 1) return diffMs <= 0 ? 'Due now' : 'Less than a minute';
    if (diffMinutes < 60) {
      return diffMs <= 0 ? `${diffMinutes} min overdue` : `in ${diffMinutes} min`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return diffMs <= 0 ? `${diffHours} hr overdue` : `in ${diffHours} hr`;
    }
    const diffDays = Math.round(diffHours / 24);
    return diffMs <= 0 ? `${diffDays} day${diffDays > 1 ? 's' : ''} overdue` : `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
  };

  const formatDateTimeReadable = (iso) => {
    if (!iso) return 'Time TBD';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Time TBD';
    return date.toLocaleString();
  };

  const getMeetingCountdownLabel = (iso) => {
    if (!iso) return 'Time TBD';
    const eventDate = new Date(iso);
    if (Number.isNaN(eventDate.getTime())) return 'Time TBD';

    const diffMs = eventDate.getTime() - Date.now();

    if (diffMs <= -15 * 60 * 1000) {
      return 'Completed';
    }

    if (diffMs < 0) {
      return 'In progress';
    }

    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 60) {
      return `in ${diffMinutes} min`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `in ${diffHours} hr`;
    }

    const diffDays = Math.round(diffHours / 24);
    return `in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  };

  const isMeetingSoon = (iso, windowHours = 24) => {
    if (!iso) return false;
    const eventDate = new Date(iso);
    if (Number.isNaN(eventDate.getTime())) return false;
    const diffMs = eventDate.getTime() - Date.now();
    return diffMs >= 0 && diffMs <= windowHours * 60 * 60 * 1000;
  };

  const toDatetimeLocal = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    const local = new Date(date.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  };

  const convertLocalToISO = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  };

  const normalizeEventAttendees = (attendees = []) =>
    attendees
      .map(att => ({
        email: att.email || null,
        displayName: att.displayName || att.email || null
      }))
      .filter(att => att.email || att.displayName);

  const buildMeetingEditDefaults = (brief) => {
    if (!brief) {
      return {
        summary: '',
        start: '',
        end: '',
        location: '',
        description: '',
        attendees: ''
      };
    }

    const calendarEvent = calendarEvents.find(event => event.id === brief.calendarEventId);
    const summary = calendarEvent?.summary || brief.summary || '';
    const location = calendarEvent?.location || brief.metadata?.location || '';
    const description = calendarEvent?.description || '';
    const startIso =
      calendarEvent?.start?.dateTime ||
      calendarEvent?.start?.date ||
      brief.calendarEventStart ||
      '';
    const eventEndIso = calendarEvent?.end?.dateTime || calendarEvent?.end?.date || '';
    const fallbackEndIso = startIso
      ? new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString()
      : '';
    const endIso = eventEndIso || fallbackEndIso;

    const attendeesFromCalendar = calendarEvent?.attendees
      ?.map(att => att.email)
      .filter(Boolean);
    const attendeesFromBrief = brief.metadata?.attendees
      ?.map(att => att.email)
      .filter(Boolean);

    const attendees =
      (attendeesFromCalendar && attendeesFromCalendar.length > 0
        ? attendeesFromCalendar
        : attendeesFromBrief && attendeesFromBrief.length > 0
          ? attendeesFromBrief
          : []);

    return {
      summary,
      start: startIso ? toDatetimeLocal(startIso) : '',
      end: endIso ? toDatetimeLocal(endIso) : '',
      location,
      description,
      attendees: attendees.join(', ')
    };
  };

  const scheduleEvent = async (event) => {
    event.preventDefault();

    if (!newEvent.summary || !newEvent.start || !newEvent.end) {
      alert('Please provide event summary, start, and end time.');
      return;
    }

    const startDate = new Date(newEvent.start);
    const endDate = new Date(newEvent.end);

    if (endDate <= startDate) {
      alert('End time must be after start time.');
      return;
    }

    setCreatingEvent(true);
    try {
      const attendees = newEvent.attendees
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);

      await axios.post('/api/calendar/events', {
        summary: newEvent.summary,
        description: newEvent.description,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        attendees,
        location: newEvent.location,
        createMeetLink: newEvent.createMeetLink
      }, {
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        }
      });

      alert('Event scheduled successfully!');
      fetchCalendarEvents();

      const nextStart = new Date(endDate.getTime() + 30 * 60 * 1000);
      const nextEnd = new Date(nextStart.getTime() + 30 * 60 * 1000);

      setNewEvent(prev => ({
        ...prev,
        summary: '',
        description: '',
        location: '',
        attendees: '',
        createMeetLink: false,
        start: formatDateTimeLocal(nextStart),
        end: formatDateTimeLocal(nextEnd)
      }));
    } catch (error) {
      console.error('Failed to schedule event:', error);
      alert('Failed to schedule event. Check console for details.');
    } finally {
      setCreatingEvent(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('vaai_token');
    setToken(null);
    setUser(null);
    setEmails([]);
    setTeams([]);
    setActiveTeamId(null);
    setCalendarEvents([]);
    setBusySlots([]);
    setAutoSortResults([]);
    setFollowUps([]);
    setFollowUpError(null);
    setFollowUpModal(null);
    setBriefing(null);
    setBriefingError(null);
    setBriefingLoading(false);
    setActionLoadingId(null);
    setActionModal(null);
    dismissToast();
    setNewEvent({
      summary: '',
      start: '',
      end: '',
      attendees: '',
      description: '',
      location: '',
      createMeetLink: false
    });
  };

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code && !token) {
      handleOAuthCallback(code);
    }
  }, []);

  const handleOAuthCallback = async (code) => {
    try {
      const response = await axios.post('/auth/google/callback', { code });
      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('vaai_token', newToken);
      setToken(newToken);
      setUser(userData);
      
      // Clean up URL
      window.history.replaceState({}, document.title, '/');
    } catch (error) {
      console.error('OAuth callback failed:', error);
    }
  };

  if (!user) {
    return (
      <div className="login-container">
        <div className="login-card">
          <h1>VAAI</h1>
          <p className="login-tagline">Virtual Assistant AI for Email Management</p>
          <button onClick={handleGoogleLogin} className="google-login-btn">
            Sign in with Google
          </button>
          <p className="login-subtext">
            Start on the Solo plan — upgrade to Business once your team is ready.
          </p>

          <div className="login-tier-section">
            <div className="login-tier-heading">
              <h2>Subscription Plans</h2>
              {subscriptionMeta.billingOptions.length > 0 && (
                <span className="login-tier-billing">
                  Billing: {subscriptionMeta.billingOptions.join(' / ')}
                </span>
              )}
            </div>

            {subscriptionLoading ? (
              <div className="login-tier-placeholder">Loading plans...</div>
            ) : subscriptionError ? (
              <div className="login-tier-error">{subscriptionError}</div>
            ) : subscriptionTiers.length > 0 ? (
              <div className="login-tier-grid">
                {subscriptionTiers.map((tier) => (
                  <div
                    key={tier.id}
                    className={`login-tier-card${tier.id === 'business' ? ' login-tier-card--featured' : ''}`}
                  >
                    <div className="login-tier-top">
                      <span className="login-tier-name">{tier.name}</span>
                      <span className="login-tier-price">
                        ${tier.monthlyPrice}
                        <span className="login-tier-price-unit">/mo</span>
                      </span>
                    </div>
                    <div className="login-tier-bestfor">{tier.bestFor}</div>
                    <ul className="login-tier-highlights">
                      {(tier.highlights.length > 0 ? tier.highlights.slice(0, 3) : ['Core AI workflows included']).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <div className="login-tier-meta">
                      <span>Seats included: {tier.seatsIncluded}</span>
                      <span>Annual: ${tier.annualPrice}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="login-tier-placeholder">Subscription plans will appear here soon.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="workspace-hero">
        <div className="workspace-nav">
          <div className="workspace-brand">
            <span className="workspace-brand-icon">🔍</span>
            <span className="workspace-brand-name">VAAI Command</span>
          </div>
          <div className="workspace-nav-right">
            <div className="workspace-team">
              <div className="workspace-team-controls">
                {teams.length > 0 ? (
                  <>
                    <label htmlFor="team-select" className="workspace-team-label">
                      Team
                    </label>
                    <select
                      id="team-select"
                      className="workspace-team-select"
                      value={activeTeamId ?? ''}
                      onChange={handleTeamSelect}
                      disabled={teamLoading}
                    >
                      {teams.map(team => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="workspace-nav-btn"
                      onClick={() => handleTeamModalOpen('invite')}
                      disabled={!activeTeamId || teamLoading}
                    >
                      Invite
                    </button>
                  </>
                ) : (
                  <span className="workspace-team-empty">Create a team to collaborate together.</span>
                )}
                <button
                  type="button"
                  className="workspace-nav-btn"
                  onClick={() => handleTeamModalOpen('create')}
                  disabled={teamLoading}
                >
                  {teams.length ? 'New Team' : 'Create Team'}
                </button>
              </div>
              {teamError && <div className="workspace-team-feedback workspace-team-feedback--error">{teamError}</div>}
              {acceptingInvite && (
                <div className="workspace-team-feedback workspace-team-feedback--info">
                  Accepting team invitation...
                </div>
              )}
            </div>
            <div className="workspace-user">
              {user.picture && <img src={user.picture} alt={user.name} className="workspace-user-avatar" />}
              <div className="workspace-user-meta">
                <span className="workspace-user-name">{user.name}</span>
                <button type="button" onClick={logout}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-hero-body">
          <div className="workspace-hero-copy">
            <span className="workspace-pill">Assistant workspace</span>
            <h1>
              Your inbox, calendar, and follow-ups — orchestrated by VAAI.
            </h1>
            <p>
              Monitor key conversations, generate docs and sheets in one click, and convert AI insights into scheduled
              reminders without leaving the command center.
            </p>
            <div className="workspace-hero-stats">
              <div className="workspace-stat-card">
                <span className="workspace-stat-value">{followUpPendingCount}</span>
                <span className="workspace-stat-label">follow-ups waiting</span>
              </div>
              <div className="workspace-stat-card">
                <span className="workspace-stat-value">{openTaskCount}</span>
                <span className="workspace-stat-label">tasks to finish</span>
              </div>
              <div className="workspace-stat-card">
                <span className="workspace-stat-value">{upcomingMeetingCount}</span>
                <span className="workspace-stat-label">meetings prepped</span>
              </div>
            </div>
            <div className="workspace-hero-actions">
              <a href="#automation" className="workspace-hero-cta">
                Open automation hub →
              </a>
              <button
                type="button"
                className="workspace-hero-refresh"
                onClick={refreshBriefing}
                disabled={briefingLoading}
              >
                {briefingLoading ? 'Refreshing briefing...' : 'Refresh briefing'}
              </button>
            </div>
          </div>
          <div className="workspace-hero-panel">
            <h2>Today’s focus</h2>
            <ul>
              <li>
                {followUpPendingCount ? `${followUpPendingCount} contacts` : 'No contacts'} awaiting follow-up review.
              </li>
              <li>
                {openTaskCount
                  ? `${openTaskCount} Google Tasks assigned to you.`
                  : 'No Google Tasks pending — create one below.'}
              </li>
              <li>
                {upcomingMeetingCount
                  ? `${upcomingMeetingCount} briefing${upcomingMeetingCount === 1 ? '' : 's'} ready for meetings.`
                  : 'Generate a briefing to prep for your next meeting.'}
              </li>
            </ul>
            <p className="workspace-hero-panel-note">
              Keep momentum: turn insights into outreach or docs via the automation hub below.
            </p>
          </div>
        </div>
      </header>

      <main className="workspace-main">
        <section className="automation-section" id="automation">
          <header className="automation-header">
            <div>
              <span className="workspace-pill">Automation hub</span>
              <h2>Launch AI-powered actions right from the dashboard</h2>
              <p>
                Send approved follow-ups, create Docs and Sheets, or time-block reminders in seconds. Everything routes
                through your connected Google Workspace account.
              </p>
            </div>
          </header>
          <div className="automation-grid">
            <form className="automation-card" onSubmit={handleSendGmail}>
              <div>
                <h3>Send Gmail follow-up</h3>
                <p>Push an assistant-approved note straight to the contact’s inbox.</p>
              </div>
              <label>
                To
                <input
                  type="email"
                  placeholder="prospect@example.com"
                  value={gmailForm.to}
                  onChange={(event) => setGmailForm(prev => ({ ...prev, to: event.target.value }))}
                  required
                  disabled={automationLoading.gmail}
                />
              </label>
              <label>
                Subject
                <input
                  type="text"
                  placeholder="Re: Next steps"
                  value={gmailForm.subject}
                  onChange={(event) => setGmailForm(prev => ({ ...prev, subject: event.target.value }))}
                  required
                  disabled={automationLoading.gmail}
                />
              </label>
              <label>
                Message
                <textarea
                  placeholder="Draft message for the contact..."
                  value={gmailForm.textBody}
                  onChange={(event) => setGmailForm(prev => ({ ...prev, textBody: event.target.value }))}
                  rows={4}
                  required
                  disabled={automationLoading.gmail}
                />
              </label>
              <button type="submit" disabled={automationLoading.gmail}>
                {automationLoading.gmail ? 'Sending...' : 'Send via Gmail'}
              </button>
            </form>

            <form className="automation-card" onSubmit={handleCreateDoc}>
              <div>
                <h3>Create Google Doc</h3>
                <p>Spin up meeting briefs or recap notes and open them instantly for edits.</p>
              </div>
              <label>
                Title
                <input
                  type="text"
                  placeholder="Client kickoff notes"
                  value={docsForm.title}
                  onChange={(event) => setDocsForm(prev => ({ ...prev, title: event.target.value }))}
                  required
                  disabled={automationLoading.doc}
                />
              </label>
              <div className="automation-subsection">
                <label>
                  Template (optional)
                  <select
                    value={docsForm.templateId}
                    onChange={(event) => setDocsForm(prev => ({ ...prev, templateId: event.target.value }))}
                    disabled={automationLoading.doc || docTemplatesLoading}
                  >
                    <option value="">Start from blank</option>
                    {docTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="template-actions">
                  <input
                    type="text"
                    placeholder="Template folder ID (optional)"
                    value={docTemplateFolderInput}
                    onChange={(event) => setDocTemplateFolderInput(event.target.value)}
                    onBlur={() => setDocsTemplateFolderId(docTemplateFolderInput.trim())}
                    disabled={automationLoading.doc}
                  />
                  <div className="template-action-buttons">
                    <button
                      type="button"
                      onClick={applyTemplateFolder}
                      disabled={docTemplatesLoading || automationLoading.doc}
                    >
                      {docTemplatesLoading ? 'Refreshing...' : 'Refresh templates'}
                    </button>
                    {selectedTemplate?.webViewLink && (
                      <button
                        type="button"
                        onClick={() => window.open(selectedTemplate.webViewLink, '_blank', 'noopener')}
                      >
                        Open template
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label>
                Destination folder ID (optional)
                <input
                  type="text"
                  placeholder="Drive folder for new documents"
                  value={docsForm.folderId || ''}
                  onChange={(event) => setDocsForm(prev => ({ ...prev, folderId: event.target.value }))}
                  disabled={automationLoading.doc}
                />
              </label>
              <div className="inline-field">
                <span>Content format</span>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="docFormat"
                      value="markdown"
                      checked={docsForm.contentFormat === 'markdown'}
                      onChange={(event) => setDocsForm(prev => ({ ...prev, contentFormat: event.target.value }))}
                      disabled={automationLoading.doc}
                    />
                    Markdown
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="docFormat"
                      value="plain"
                      checked={docsForm.contentFormat === 'plain'}
                      onChange={(event) => setDocsForm(prev => ({ ...prev, contentFormat: event.target.value }))}
                      disabled={automationLoading.doc}
                    />
                    Plain text
                  </label>
                </div>
              </div>
              <label>
                Content (optional)
                <textarea
                  placeholder="Outline agenda, action items, or drafted notes. Markdown headings and lists are supported."
                  value={docsForm.content}
                  onChange={(event) => setDocsForm(prev => ({ ...prev, content: event.target.value }))}
                  rows={10}
                  disabled={automationLoading.doc}
                />
              </label>
              <button type="submit" disabled={automationLoading.doc}>
                {automationLoading.doc ? 'Creating...' : 'Create Google Doc'}
              </button>
            </form>

            <form className="automation-card" onSubmit={handleAppendSheet}>
              <div>
                <h3>Append Google Sheet rows</h3>
                <p>Log product performance, outreach metrics, or pipeline updates for finance & ops.</p>
              </div>
              <div className="automation-subsection">
                <label>
                  Spreadsheet
                  <select
                    value={sheetsForm.spreadsheetId}
                    onChange={(event) => setSheetsForm(prev => ({ ...prev, spreadsheetId: event.target.value }))}
                    disabled={automationLoading.sheet || sheetCatalogLoading}
                  >
                    <option value="">Select spreadsheet...</option>
                    {sheetCatalog.map((sheet) => (
                      <option key={sheet.id} value={sheet.id}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="template-actions">
                  <input
                    type="text"
                    placeholder="Spreadsheet folder ID (optional)"
                    value={sheetCatalogFolderInput}
                    onChange={(event) => setSheetCatalogFolderInput(event.target.value)}
                    onBlur={() => setSheetCatalogFolderId(sheetCatalogFolderInput.trim())}
                    disabled={automationLoading.sheet}
                  />
                  <div className="template-action-buttons">
                    <button
                      type="button"
                      onClick={applySheetFolder}
                      disabled={sheetCatalogLoading || automationLoading.sheet}
                    >
                      {sheetCatalogLoading ? 'Refreshing...' : 'Refresh sheets'}
                    </button>
                    {selectedSheet?.webViewLink && (
                      <button
                        type="button"
                        onClick={() => window.open(selectedSheet.webViewLink, '_blank', 'noopener')}
                      >
                        Open sheet
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <label>
                Range
                <input
                  type="text"
                  placeholder="Sheet1!A1"
                  value={sheetsForm.range}
                  onChange={(event) => setSheetsForm(prev => ({ ...prev, range: event.target.value }))}
                  required
                  disabled={automationLoading.sheet}
                />
              </label>
              <div className="inline-field">
                <span>Input mode</span>
                <div className="radio-group">
                  <label>
                    <input
                      type="radio"
                      name="sheetInputOption"
                      value="USER_ENTERED"
                      checked={sheetsForm.valueInputOption === 'USER_ENTERED'}
                      onChange={(event) => setSheetsForm(prev => ({ ...prev, valueInputOption: event.target.value }))}
                      disabled={automationLoading.sheet}
                    />
                    Respect Sheets formatting
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="sheetInputOption"
                      value="RAW"
                      checked={sheetsForm.valueInputOption === 'RAW'}
                      onChange={(event) => setSheetsForm(prev => ({ ...prev, valueInputOption: event.target.value }))}
                      disabled={automationLoading.sheet}
                    />
                    Raw values
                  </label>
                </div>
              </div>
              <label>
                Values (CSV or paste from Sheets)
                <textarea
                  placeholder={'Date, Product, Revenue\n2025-01-01, Luxury Watch, 12400'}
                  value={sheetsForm.valuesText}
                  onChange={(event) => setSheetsForm(prev => ({ ...prev, valuesText: event.target.value }))}
                  rows={6}
                  required
                  disabled={automationLoading.sheet}
                />
              </label>
              {sheetPreview.length > 0 && (
                <div className="sheet-preview">
                  <span className="form-hint">Preview ({sheetPreview.length} rows)</span>
                  <div className="sheet-preview-table-wrapper">
                    <table className="sheet-preview-table">
                      <tbody>
                        {sheetPreview.map((row, rowIndex) => (
                          <tr key={`${rowIndex}-${row.join('|')}`}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex}>{cell || <span className="dimmed">(blank)</span>}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <button type="submit" disabled={automationLoading.sheet}>
                {automationLoading.sheet ? 'Appending...' : 'Append rows'}
              </button>
            </form>

            <form className="automation-card" onSubmit={handleCreateReminder}>
              <div>
                <h3>Schedule reminder block</h3>
                <p>Reserve calendar time and add reminders for important follow-ups or prep work.</p>
              </div>
              <label>
                Title
                <input
                  type="text"
                  placeholder="Prep partner follow-ups"
                  value={reminderForm.summary}
                  onChange={(event) => setReminderForm(prev => ({ ...prev, summary: event.target.value }))}
                  required
                  disabled={automationLoading.reminder}
                />
              </label>
              <label>
                Start (ISO)
                <input
                  type="datetime-local"
                  value={reminderForm.start}
                  onChange={(event) => setReminderForm(prev => ({ ...prev, start: event.target.value }))}
                  disabled={automationLoading.reminder}
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="15"
                  step="15"
                  value={reminderForm.durationMinutes}
                  onChange={(event) => setReminderForm(prev => ({ ...prev, durationMinutes: event.target.value }))}
                  disabled={automationLoading.reminder}
                />
              </label>
              <button type="submit" disabled={automationLoading.reminder}>
                {automationLoading.reminder ? 'Scheduling...' : 'Create calendar block'}
              </button>
            </form>
          </div>
        </section>

        <div className="briefing-container">
          <div className="briefing-header">
            <div>
              <h2>Daily Briefing</h2>
              {briefing?.generatedAt && (
                <span className="briefing-meta">
                  Generated {new Date(briefing.generatedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
            <button
              onClick={refreshBriefing}
              className="btn btn-accent"
              disabled={briefingLoading}
            >
              {briefingLoading ? 'Refreshing...' : 'Refresh Briefing'}
            </button>
          </div>
          {briefingError && <div className="briefing-error">{briefingError}</div>}
          {!briefing && !briefingError && !briefingLoading && (
            <p className="briefing-placeholder">
              Connect your Google account to generate a personalized summary.
            </p>
          )}
          {briefingLoading && (
            <p className="briefing-placeholder">Building your daily briefing...</p>
          )}

          {briefing && (
            <>
              <div className="briefing-summary">
                {(briefing.summary || '')
                  .split('\n')
                  .filter(Boolean)
                  .map((line, idx) => (
                    <div key={idx} className="briefing-summary-line">
                      {line.startsWith('-') ? line : `- ${line}`}
                    </div>
                  ))}
              </div>
              <div className="briefing-items">
                {(briefing.items || []).slice(0, 5).map(item => (
                  <div key={item.emailId} className="briefing-item">
                    <div className="briefing-item-header">
                      <strong>{item.subject || 'No subject'}</strong>
                      <span>{item.from}</span>
                    </div>
                    <div className="briefing-tags">
                      <span className="briefing-intent">{item.intent}</span>
                      <span className="briefing-time">
                        {new Date(item.receivedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="briefing-action">{item.suggestedAction}</div>
                    <div className="briefing-snippet">{item.snippet}</div>
                    {item.actions?.length > 0 && (
                      <div className="briefing-actions">
                        {item.actions.map(action => {
                          const key = `${item.emailId}:${action.type}`;
                          const isHandled = action.type === 'mark_handled' && item.handled;
                          const isDisabled = actionLoadingId === key || isHandled;
                          const label = action.type === 'mark_handled' && item.handled
                            ? 'Handled'
                            : action.label;
                          return (
                            <button
                              key={key}
                              className="briefing-action-btn"
                              disabled={isDisabled}
                              onClick={() => !isDisabled && handleBriefingAction(item, action)}
                            >
                              {actionLoadingId === key ? 'Working...' : label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {item.lastAction && (
                      <div className={`briefing-last-action ${item.lastAction.status}`}>
                        Last action: {item.lastAction.actionType?.replace('_', ' ')} - {item.lastAction.status}
                        {item.lastAction.status === 'undone' && item.lastAction.undoneAt && (
                          <span className="briefing-last-action-time">
                            {' '}at {new Date(item.lastAction.undoneAt).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}
                    {item.lastAction &&
                      item.lastAction.actionId &&
                      item.lastAction.status !== 'undone' && (
                        <div className="briefing-feedback">
                          <span className="briefing-feedback-label">Was this helpful?</span>
                          <div className="briefing-feedback-actions">
                            {[
                              { rating: 'helpful', label: 'Helpful' },
                              { rating: 'not_helpful', label: 'Needs work' },
                              { rating: 'needs_follow_up', label: 'Follow up' }
                            ].map(option => {
                              const isSelected = item.lastAction.feedback?.rating === option.rating;
                              const isSaving = feedbackLoadingId === item.lastAction.actionId;
                              return (
                                <button
                                  key={option.rating}
                                  type="button"
                                  className={`briefing-feedback-btn ${isSelected ? 'selected' : ''}`}
                                  disabled={isSaving}
                                  onClick={() =>
                                    handleActionFeedback({
                                      actionId: item.lastAction.actionId,
                                      emailId: item.emailId,
                                      rating: option.rating
                                    })
                                  }
                                >
                                  {isSaving ? 'Saving...' : option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
                {briefing.items && briefing.items.length > 5 && (
                  <div className="briefing-more">
                    +{briefing.items.length - 5} more emails summarized in your inbox.
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="followup-container">
          <div className="followup-header">
            <div>
              <h2>Follow-Up Queue</h2>
              {followUps.length > 0 && (
                <span className="followup-subtitle">
                  {followUps.length} pending reminder{followUps.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchFollowUps}
              disabled={followUpLoading || !activeTeamId}
            >
              {followUpLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {!activeTeamId && (
            <p className="followup-placeholder">Select a team to view follow-up suggestions.</p>
          )}

          {activeTeamId && (
            <>
              {followUpError && <div className="followup-error">{followUpError}</div>}
              {!followUpError && (
                <>
                  {followUpLoading && (
                    <p className="followup-placeholder">Scanning your inbox for follow-ups...</p>
                  )}
                  {!followUpLoading && followUps.length === 0 && (
                    <p className="followup-placeholder">No pending follow-ups. Great job keeping up!</p>
                  )}
                  {!followUpLoading && followUps.length > 0 && (
                    <div className="followup-list">
                      {followUps.map(task => (
                        <div key={task.id} className="followup-item">
                          <div className="followup-main">
                            <div className="followup-title">
                              {task.subject || 'No subject'}
                            </div>
                            <div className="followup-meta">
                              <span>{task.counterpartEmail || 'Unknown contact'}</span>
                              <span>Due {formatRelativeTime(task.dueAt || task.suggestedSendAt)}</span>
                              {task.metadata?.idleDays != null && (
                                <span>Idle {task.metadata.idleDays}d</span>
                              )}
                            </div>
                            <p className="followup-summary">
                              {task.summary || 'No summary available.'}
                            </p>
                          </div>
                          <div className="followup-actions">
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => openFollowUpModal(task)}
                              disabled={followUpActionId === task.id}
                            >
                              Review & Send
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleFollowUpSnooze(task, 60 * 24)}
                              disabled={followUpActionId === task.id}
                            >
                              Snooze 1 day
                            </button>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => handleFollowUpRegenerate(task)}
                              disabled={followUpActionId === task.id}
                            >
                              Regenerate
                            </button>
                            <button
                              type="button"
                              className="link-button danger"
                              onClick={() => handleFollowUpDismiss(task)}
                              disabled={followUpActionId === task.id}
                            >
                              Dismiss
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="tasks-container">
          <div className="tasks-header">
            <div>
              <h2>Google Tasks</h2>
              {token && !tasksLoading && tasks.length > 0 && (
                <span className="tasks-subtitle">
                  {taskShowCompleted
                    ? `${openTaskCount} open / ${completedTaskCount} completed`
                    : `${openTaskCount} open task${openTaskCount === 1 ? '' : 's'}`
                  }
                </span>
              )}
            </div>
            <div className="tasks-controls">
              <label className="tasks-toggle">
                <input
                  type="checkbox"
                  checked={taskShowCompleted}
                  onChange={(event) => setTaskShowCompleted(event.target.checked)}
                  disabled={tasksLoading || !token}
                />
                Show completed
              </label>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchTasks}
                disabled={tasksLoading || !token}
              >
                {tasksLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {tasksError && <div className="tasks-error">{tasksError}</div>}

          {!token && (
            <p className="tasks-placeholder">
              Sign in with Google to sync reminders with Google Tasks.
            </p>
          )}

          {token && (
            <>
              {tasksLoading && (
                <div className="tasks-skeleton-list">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={`task-skeleton-${index}`} className="task-item skeleton">
                      <div className="task-title shimmer" />
                      <div className="task-meta shimmer" />
                    </div>
                  ))}
                </div>
              )}

              {!tasksLoading && tasks.length === 0 && (
                <p className="tasks-placeholder">
                  {taskShowCompleted
                    ? 'No completed tasks to show.'
                    : 'No open tasks yet. Add your first reminder below.'}
                </p>
              )}

              {!tasksLoading && tasks.length > 0 && (
                <div className="tasks-list">
                  {tasks.map(task => {
                    const isCompleted = task.status === 'completed';
                    const dueTimestamp = task.due ? new Date(task.due).getTime() : NaN;
                    const isOverdue =
                      !isCompleted &&
                      !Number.isNaN(dueTimestamp) &&
                      dueTimestamp < Date.now();
                    return (
                      <div
                        key={task.id}
                        className={`task-item${isCompleted ? ' completed' : ''}`}
                      >
                        <div className="task-main">
                          <div className="task-title">
                            {task.title || 'Untitled task'}
                            {isCompleted && <span className="task-status-chip">Completed</span>}
                          </div>
                          {task.notes && <p className="task-notes">{task.notes}</p>}
                          <div className="task-meta">
                            <span className={isOverdue ? 'task-due task-due-overdue' : 'task-due'}>
                              {task.due ? `Due ${formatRelativeTime(task.due)}` : 'No due date set'}
                            </span>
                            {task.due && (
                              <span className="task-due-absolute">
                                {formatDateTimeReadable(task.due)}
                              </span>
                            )}
                            {task.completed && (
                              <span>Completed {formatDateTimeReadable(task.completed)}</span>
                            )}
                            {!task.completed && task.updated && (
                              <span>Updated {formatDateTimeReadable(task.updated)}</span>
                            )}
                            {task.webViewLink && (
                              <a
                                href={task.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                                className="link-button"
                              >
                                Open in Google Tasks
                              </a>
                            )}
                          </div>
                        </div>
                        {!isCompleted && (
                          <button
                            type="button"
                            className="btn btn-primary task-complete-btn"
                            onClick={() => handleCompleteTask(task.id)}
                            disabled={tasksLoading}
                          >
                            Mark Done
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <form className="tasks-form" onSubmit={handleTaskSubmit}>
                <h3>Add a Reminder</h3>
                <div className="tasks-form-grid">
                  <label>
                    Title
                    <input
                      type="text"
                      value={taskForm.title}
                      onChange={(event) => handleTaskFormChange('title', event.target.value)}
                      placeholder="Follow up with..."
                      required
                      disabled={taskSubmitting}
                    />
                  </label>
                  <label>
                    Due
                    <input
                      type="datetime-local"
                      value={taskForm.due}
                      onChange={(event) => handleTaskFormChange('due', event.target.value)}
                      disabled={taskSubmitting}
                    />
                  </label>
                </div>
                <label>
                  Notes
                  <textarea
                    value={taskForm.notes}
                    onChange={(event) => handleTaskFormChange('notes', event.target.value)}
                    placeholder="Add optional context"
                    rows={3}
                    disabled={taskSubmitting}
                  />
                </label>
                <div className="tasks-form-actions">
                  <button
                    type="submit"
                    className="btn btn-secondary"
                    disabled={taskSubmitting}
                  >
                    {taskSubmitting ? 'Saving...' : 'Add Task'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="meeting-container">
          <div className="meeting-header">
            <div>
              <h2>Meeting Prep</h2>
              {meetingBriefs.length > 0 && (
                <span className="meeting-subtitle">
                  Viewing {filteredMeetingBriefs.length} of {meetingBriefs.length}{' '}
                  meeting{meetingBriefs.length === 1 ? '' : 's'}
                  {meetingView !== 'all' && (
                    <> · <span className="meeting-filter-label">{meetingFilters.find(filter => filter.id === meetingView)?.label}</span></>
                  )}
                </span>
              )}
            </div>
            <div className="meeting-controls">
              <select
                className="meeting-select"
                value={meetingScope}
                onChange={(event) => setMeetingScope(event.target.value)}
                disabled={!activeTeamId || meetingBriefLoading}
                aria-label="Meeting scope"
              >
                <option value="team">Team meetings</option>
                <option value="mine">My meetings</option>
              </select>
              <select
                className="meeting-select"
                value={meetingView}
                onChange={(event) => setMeetingView(event.target.value)}
                disabled={!activeTeamId || meetingBriefLoading || meetingBriefs.length === 0}
                aria-label="Meeting filter"
              >
                {meetingFilters.map(filter => (
                  <option key={filter.id} value={filter.id}>
                    {filter.label}
                  </option>
                ))}
              </select>
              <select
                className="meeting-select"
                value={meetingRangeDays}
                onChange={(event) => setMeetingRangeDays(Number(event.target.value))}
                disabled={!activeTeamId || meetingBriefLoading}
                aria-label="Meeting range"
              >
                <option value={3}>Next 3 days</option>
                <option value={7}>Next 7 days</option>
                <option value={14}>Next 14 days</option>
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchMeetingBriefs}
                disabled={meetingBriefLoading || !activeTeamId}
              >
                {meetingBriefLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {!activeTeamId && (
            <p className="meeting-placeholder">Select a team to view meeting briefs.</p>
          )}

          {activeTeamId && (
            <>
              {meetingBriefError && <div className="meeting-error">{meetingBriefError}</div>}
              {!meetingBriefError && (
                <>
                  {meetingBriefLoading && (
                    <div className="meeting-skeleton-list">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div key={`skeleton-${index}`} className="meeting-item skeleton">
                          <div className="meeting-main">
                            <div className="meeting-title shimmer" />
                            <div className="meeting-meta shimmer" />
                            <div className="meeting-meta shimmer short" />
                            <div className="meeting-summary shimmer" />
                          </div>
                          <div className="meeting-actions">
                            <span className="btn btn-primary shimmer-button" />
                            <span className="btn btn-secondary shimmer-button" />
                            <span className="link-button shimmer-pill" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {!meetingBriefLoading && meetingBriefs.length === 0 && (
                    <p className="meeting-placeholder">No meeting briefs yet. Check back closer to your events.</p>
                  )}
                  {!meetingBriefLoading &&
                    meetingBriefs.length > 0 &&
                    filteredMeetingBriefs.length === 0 && (
                      <p className="meeting-placeholder">
                        No meetings match this view. Try a different filter or timeframe.
                      </p>
                    )}
                  {!meetingBriefLoading && filteredMeetingBriefs.length > 0 && (
                    <div className="meeting-list">
                      {filteredMeetingBriefs.map(brief => {
                        const countdownLabel = getMeetingCountdownLabel(brief.calendarEventStart);
                        const eventDateLabel = formatDateTimeReadable(brief.calendarEventStart);
                        const showReviewAlert =
                          brief.status !== 'reviewed' && isMeetingSoon(brief.calendarEventStart);
                        return (
                          <div key={brief.id} className="meeting-item">
                            <div className="meeting-main">
                              <div className="meeting-title">
                                {brief.metadata?.eventSummary || parseLines(brief.summary)[0] || 'Upcoming meeting'}
                              </div>
                              <div className="meeting-meta">
                                <span className="meeting-date">{eventDateLabel}</span>
                                <span className="meeting-countdown">{countdownLabel}</span>
                                {brief.metadata?.location && <span>{brief.metadata.location}</span>}
                                <span className={`meeting-status meeting-status-${brief.status}`}>
                                  {brief.status}
                                </span>
                              </div>
                              {showReviewAlert && (
                                <div className="meeting-alert">
                                  Review before the meeting starts (within 24 hours)
                                </div>
                              )}
                              {brief.metadata?.attendees?.length > 0 && (
                                <div className="meeting-meta">
                                  <span>Attendees: {formatAttendeesList(brief.metadata.attendees)}</span>
                                </div>
                              )}
                              <p className="meeting-summary">
                                {parseLines(brief.summary)[0] || 'Summary will appear once generated.'}
                              </p>
                            </div>
                            <div className="meeting-actions">
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => openMeetingBriefModal(brief)}
                              >
                                Open Brief
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => handleMeetingBriefStatus(brief, 'reviewed')}
                                disabled={brief.status === 'reviewed'}
                              >
                                {brief.status === 'reviewed' ? 'Reviewed' : 'Mark Reviewed'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => openMeetingDetailsPanel(brief)}
                              >
                                View Details
                              </button>
                              {brief.metadata?.hangoutLink && (
                                <button
                                  type="button"
                                  className="link-button"
                                  onClick={() => copyToClipboard(brief.metadata.hangoutLink)}
                                >
                                  Copy Meeting Link
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {meetingEventDetails && (
          <aside className="meeting-details-panel">
            <header className="meeting-details-header">
              <div>
                <h3>{meetingEventDetails.metadata?.eventSummary || parseLines(meetingEventDetails.summary)[0] || 'Meeting details'}</h3>
                <p className="meeting-details-time">
                  {meetingEventDetails.calendarEventStart
                    ? formatDateTimeReadable(meetingEventDetails.calendarEventStart)
                    : 'Unknown start time'}
                </p>
              </div>
              <div className="meeting-details-actions">
                {meetingEditMode ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCancelMeetingEdit}
                    disabled={meetingEditSaving}
                  >
                    Cancel edit
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={beginMeetingEdit}
                  >
                    Edit event
                  </button>
                )}
                <button
                  type="button"
                  className="modal-close"
                  onClick={closeMeetingDetailsPanel}
                  aria-label="Close meeting details"
                >
                  &times;
                </button>
              </div>
            </header>
            <div className="meeting-details-body">
              {meetingEditMode ? (
                <form className="meeting-edit-form" onSubmit={handleMeetingEditSubmit}>
                  <label>
                    <span>Title</span>
                    <input
                      type="text"
                      value={meetingEditForm.summary}
                      onChange={(event) => handleMeetingEditChange('summary', event.target.value)}
                      required
                    />
                  </label>
                  <div className="meeting-edit-row">
                    <label>
                      <span>Starts</span>
                      <input
                        type="datetime-local"
                        value={meetingEditForm.start}
                        onChange={(event) => handleMeetingEditChange('start', event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Ends</span>
                      <input
                        type="datetime-local"
                        value={meetingEditForm.end}
                        onChange={(event) => handleMeetingEditChange('end', event.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    <span>Location</span>
                    <input
                      type="text"
                      value={meetingEditForm.location}
                      onChange={(event) => handleMeetingEditChange('location', event.target.value)}
                      placeholder="Add a room, address, or link"
                    />
                  </label>
                  <label>
                    <span>Attendees</span>
                    <input
                      type="text"
                      value={meetingEditForm.attendees}
                      onChange={(event) => handleMeetingEditChange('attendees', event.target.value)}
                      placeholder="name@example.com, teammate@example.com"
                    />
                  </label>
                  <label>
                    <span>Notes</span>
                    <textarea
                      value={meetingEditForm.description}
                      onChange={(event) => handleMeetingEditChange('description', event.target.value)}
                      rows={4}
                      placeholder="Add context, goals, or talking points"
                    />
                  </label>
                  <div className="meeting-edit-actions">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={meetingEditSaving}
                    >
                      {meetingEditSaving ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCancelMeetingEdit}
                      disabled={meetingEditSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {meetingEventDetails.metadata?.location && (
                    <div className="meeting-detail-block">
                      <span className="label">Location</span>
                      <span>{meetingEventDetails.metadata.location}</span>
                    </div>
                  )}
                  {meetingEventDetails.metadata?.attendees?.length > 0 && (
                    <div className="meeting-detail-block">
                      <span className="label">Attendees</span>
                      <span>{formatAttendeesList(meetingEventDetails.metadata.attendees)}</span>
                    </div>
                  )}
                  {meetingEventDetails.summary && (
                    <div className="meeting-detail-block">
                      <span className="label">Summary</span>
                      <p>{meetingEventDetails.summary}</p>
                    </div>
                  )}
                  {meetingEventDetails.agenda && (
                    <div className="meeting-detail-block">
                      <span className="label">Agenda</span>
                      <ul>
                        {parseLines(meetingEventDetails.agenda).map((line, idx) => (
                          <li key={`agenda-detail-${idx}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {meetingEventDetails.metadata?.hangoutLink && (
                    <div className="meeting-detail-block">
                      <span className="label">Meeting link</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => copyToClipboard(meetingEventDetails.metadata.hangoutLink)}
                      >
                        Copy meeting link
                      </button>
                    </div>
                  )}
                  {meetingEventDetails.metadata?.htmlLink && (
                    <div className="meeting-detail-block">
                      <span className="label">Calendar link</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => copyToClipboard(meetingEventDetails.metadata.htmlLink)}
                      >
                        Copy calendar link
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {token && (
          <div className="metrics-card">
            <div className="metrics-header">
              <div>
                <h3>Assistant Metrics</h3>
                {actionMetrics?.timeframeDays ? (
                  <span className="metrics-subtitle">
                    Last {actionMetrics.timeframeDays} day{actionMetrics.timeframeDays > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="metrics-subtitle">All recorded actions</span>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fetchActionMetrics()}
                disabled={metricsLoading}
              >
                {metricsLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {metricsError && <p className="metrics-error">{metricsError}</p>}

            {!metricsError && (
              <>
                {metricsLoading && !actionMetrics && (
                  <p className="metrics-placeholder">Loading assistant insights...</p>
                )}

                {!metricsLoading && !actionMetrics && (
                  <p className="metrics-placeholder">
                    No assistant activity recorded yet. Trigger an action to see impact.
                  </p>
                )}

                {actionMetrics && (
                  <div className="metrics-body">
                    <div className="metrics-summary">
                      <div className="metrics-stat">
                        <span>Total actions</span>
                        <strong>{actionMetrics.totals?.total ?? 0}</strong>
                      </div>
                      <div className="metrics-stat">
                        <span>Completed</span>
                        <strong>{actionMetrics.totals?.completed ?? 0}</strong>
                      </div>
                      <div className="metrics-stat">
                        <span>Undone</span>
                        <strong>{actionMetrics.totals?.undone ?? 0}</strong>
                      </div>
                      <div className="metrics-stat">
                        <span>Marked helpful</span>
                        <strong>{actionMetrics.feedback?.helpful ?? 0}</strong>
                      </div>
                    </div>

                    {actionMetrics.byType?.length > 0 && (
                      <div className="metrics-section">
                        <h4>By action type</h4>
                        <ul className="metrics-breakdown">
                          {actionMetrics.byType.map(item => (
                            <li key={item.actionType} className="metrics-breakdown-item">
                              <div>
                                <span className="metrics-breakdown-label">
                                  {item.actionType.replace(/_/g, ' ')}
                                </span>
                                <span className="metrics-breakdown-sub">
                                  {item.completed}/{item.total} completed
                                </span>
                              </div>
                              <div className="metrics-breakdown-feedback">
                                <span className="metrics-chip positive">H: {item.helpful}</span>
                                <span className="metrics-chip neutral">U: {item.undone}</span>
                                <span className="metrics-chip warning">N: {item.notHelpful}</span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {actionMetrics.recent?.length > 0 && (
                      <div className="metrics-section">
                        <h4>Recent assistant actions</h4>
                        <ul className="metrics-recent">
                          {actionMetrics.recent.map(entry => (
                            <li key={entry.id} className="metrics-recent-item">
                              <div>
                                <span className="metrics-recent-title">
                                  {entry.actionType.replace(/_/g, ' ')}
                                </span>
                                <span className="metrics-recent-meta">
                                  {new Date(entry.createdAt).toLocaleString()}
                                </span>
                              </div>
                              <div className={`metrics-badge ${entry.status}`}>
                                {entry.status.replace(/_/g, ' ')}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="controls">
          <button 
            onClick={fetchEmails} 
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? 'Loading...' : 'Fetch Emails'}
          </button>
          
          {emails.length > 0 && (
            <button 
              onClick={classifyEmails} 
              disabled={loading}
              className="btn btn-secondary"
            >
              {loading ? 'Classifying...' : 'Classify Emails'}
            </button>
          )}
          <button
            onClick={autoSortInbox}
            disabled={autoSortLoading}
            className="btn btn-accent"
          >
            {autoSortLoading ? 'Sorting...' : 'Auto-Sort Inbox'}
          </button>
        </div>

        <div className="emails-container">
          <h2>Recent Emails ({emails.length})</h2>
          {emails.length === 0 ? (
            <p>No emails loaded. Click "Fetch Emails" to get started.</p>
          ) : (
            <div className="emails-list">
              {emails.map(email => (
                <div key={email.id} className="email-item">
                  <div className="email-header">
                    <strong>{email.subject}</strong>
                    <span className="email-date">
                      {new Date(email.date).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="email-from">{email.from}</div>
                  <div className="email-snippet">{email.snippet}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {autoSortResults.length > 0 && (
          <div className="autosort-container">
            <h2>Auto-sort Results</h2>
            <div className="autosort-list">
              {autoSortResults.map(result => (
                <div key={result.emailId} className="autosort-item">
                  <div className="autosort-header">
                    <strong>{result.subject || 'No subject'}</strong>
                    <span>{result.from}</span>
                  </div>
                  {result.error ? (
                    <div className="autosort-error">Failed: {result.error}</div>
                  ) : (
                    <>
                      <div className="autosort-meta">
                        <span className="autosort-badge">
                          {result.category?.name || 'Uncategorized'}
                        </span>
                        <span className="autosort-source">
                          {result.decision?.source === 'rule'
                            ? `Rule: ${result.decision.rule?.type} contains "${result.decision.rule?.value}"`
                            : `AI suggestion: ${result.decision?.aiCategoryName || 'Unknown'}`}
                        </span>
                      </div>
                      {result.labelApplied && (
                        <div className="autosort-label">
                          Gmail label: {result.labelApplied.name}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="calendar-container">
          <h2>Calendar Assistant</h2>
          <div className="controls">
            <button 
              onClick={fetchCalendarEvents}
              disabled={calendarLoading}
              className="btn btn-primary"
            >
              {calendarLoading ? 'Loading...' : 'Refresh Upcoming Events'}
            </button>
            <button 
              onClick={fetchAvailability}
              disabled={calendarLoading}
              className="btn btn-secondary"
            >
              {calendarLoading ? 'Checking...' : 'Check Availability'}
            </button>
          </div>

          <div className="calendar-grid">
            <div className="calendar-panel">
              <h3>Upcoming Events ({calendarEvents.length})</h3>
              {calendarEvents.length === 0 ? (
                <p>No events found for the next few days.</p>
              ) : (
                <ul className="calendar-list">
                  {calendarEvents.map(event => (
                    <li key={event.id} className="calendar-item">
                      <strong>{event.summary || 'Untitled Event'}</strong>
                        <div>{formatEventTime(event.start)} {'→'} {formatEventTime(event.end)}</div>
                      {event.attendees?.length > 0 && (
                        <div className="calendar-attendees">
                          Attendees: {event.attendees.map(attendee => attendee.email).join(', ')}
                        </div>
                      )}
                      {event.hangoutLink && (
                        <a href={event.hangoutLink} target="_blank" rel="noreferrer">
                          Join meeting
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="calendar-panel">
              <h3>Busy Slots</h3>
              {busySlots.length === 0 ? (
                <p>No busy times retrieved yet.</p>
              ) : (
                <ul className="calendar-list">
                  {busySlots.map((slot, index) => (
                    <li key={`${slot.start}-${index}`} className="calendar-item">
                      {formatBusyWindow(slot)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="calendar-form-wrapper">
            <h3>Schedule New Event</h3>
            <form className="calendar-form" onSubmit={scheduleEvent}>
              <label>
                Title
                <input
                  type="text"
                  value={newEvent.summary}
                  onChange={(e) => handleNewEventChange('summary', e.target.value)}
                  placeholder="Meeting subject"
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={newEvent.description}
                  onChange={(e) => handleNewEventChange('description', e.target.value)}
                  placeholder="Agenda or meeting notes"
                  rows={3}
                />
              </label>
              <label>
                Location
                <input
                  type="text"
                  value={newEvent.location}
                  onChange={(e) => handleNewEventChange('location', e.target.value)}
                  placeholder="Conference room or link"
                />
              </label>
              <div className="date-time-row">
                <label>
                  Start
                  <input
                    type="datetime-local"
                    value={newEvent.start}
                    onChange={(e) => handleNewEventChange('start', e.target.value)}
                    required
                  />
                </label>
                <label>
                  End
                  <input
                    type="datetime-local"
                    value={newEvent.end}
                    onChange={(e) => handleNewEventChange('end', e.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Attendees (comma separated emails)
                <input
                  type="text"
                  value={newEvent.attendees}
                  onChange={(e) => handleNewEventChange('attendees', e.target.value)}
                  placeholder="person@example.com"
                />
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={newEvent.createMeetLink}
                  onChange={(e) => handleNewEventChange('createMeetLink', e.target.checked)}
                />
                Create Google Meet link
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creatingEvent}
              >
                {creatingEvent ? 'Scheduling...' : 'Schedule Event'}
              </button>
            </form>
          </div>
        </div>
      </main>

      {teamModal && (
        <div className="team-modal-overlay" onClick={handleTeamModalClose}>
          <div className="team-modal" onClick={(e) => e.stopPropagation()}>
            <div className="team-modal-header">
              <h3>{teamModal.type === 'create' ? 'Create a Team' : 'Invite a Teammate'}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={handleTeamModalClose}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            {teamError && <div className="team-modal-error">{teamError}</div>}

            {teamModal.type === 'create' && (
              <form className="team-modal-body" onSubmit={handleCreateTeam}>
                <label className="team-field">
                  <span>Team name</span>
                  <input
                    type="text"
                    value={teamForm.name}
                    onChange={(event) => handleTeamFormChange('name', event.target.value)}
                    placeholder="e.g. Customer Success"
                    required
                  />
                </label>
                <div className="team-modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleTeamModalClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={teamLoading}>
                    {teamLoading ? 'Creating...' : 'Create team'}
                  </button>
                </div>
              </form>
            )}

            {teamModal.type === 'invite' && (
              <form className="team-modal-body" onSubmit={handleInviteMember}>
                <label className="team-field">
                  <span>Teammate email</span>
                  <input
                    type="email"
                    value={teamForm.inviteEmail}
                    onChange={(event) => handleTeamFormChange('inviteEmail', event.target.value)}
                    placeholder="name@example.com"
                    required
                  />
                </label>
                <label className="team-field">
                  <span>Role</span>
                  <select
                    value={teamForm.inviteRole}
                    onChange={(event) => handleTeamFormChange('inviteRole', event.target.value)}
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <p className="team-modal-hint">
                  Admins can invite teammates and manage shared inbox rules.
                </p>
                <div className="team-modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={handleTeamModalClose}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={teamLoading || !activeTeamId}>
                    {teamLoading ? 'Sending...' : 'Send invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {meetingBriefModal && (
        <div className="meeting-modal-overlay" onClick={closeMeetingBriefModal}>
          <div className="meeting-modal" onClick={(e) => e.stopPropagation()}>
            <div className="meeting-modal-header">
              <h3>Meeting Brief</h3>
              <button className="modal-close" onClick={closeMeetingBriefModal} aria-label="Close modal" type="button">
                &times;
              </button>
            </div>
            <div className="meeting-modal-body">
              <div className="meeting-section">
                <h4>When</h4>
                <p>{formatDateTimeReadable(meetingBriefModal.calendarEventStart)}</p>
              </div>
              {meetingBriefModal.metadata?.location && (
                <div className="meeting-section">
                  <h4>Location</h4>
                  <p>{meetingBriefModal.metadata.location}</p>
                </div>
              )}
              {meetingBriefModal.metadata?.attendees?.length > 0 && (
                <div className="meeting-section">
                  <h4>Attendees</h4>
                  <p>{formatAttendeesList(meetingBriefModal.metadata.attendees)}</p>
                </div>
              )}
              <div className="meeting-section">
                <h4>Summary</h4>
                <p>{meetingBriefModal.summary || 'Summary unavailable.'}</p>
              </div>
              <div className="meeting-section">
                <h4>Agenda</h4>
                {parseLines(meetingBriefModal.agenda).length ? (
                  <ul>
                    {parseLines(meetingBriefModal.agenda).map((line, idx) => (
                      <li key={`agenda-${idx}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No agenda drafted yet.</p>
                )}
              </div>
              <div className="meeting-section">
                <h4>Talking Points</h4>
                {parseLines(meetingBriefModal.talkingPoints).length ? (
                  <ul>
                    {parseLines(meetingBriefModal.talkingPoints).map((line, idx) => (
                      <li key={`talking-point-${idx}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No talking points drafted yet.</p>
                )}
              </div>
              <div className="meeting-section">
                <h4>Intel</h4>
                {parseLines(meetingBriefModal.intel).length ? (
                  <ul>
                    {parseLines(meetingBriefModal.intel).map((line, idx) => (
                      <li key={`intel-${idx}`}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No additional intel.</p>
                )}
              </div>
            </div>
            <div className="meeting-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeMeetingBriefModal}>
                Close
              </button>
              {meetingBriefModal.status !== 'reviewed' && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    handleMeetingBriefStatus(meetingBriefModal, 'reviewed');
                    closeMeetingBriefModal();
                  }}
                >
                  Mark Reviewed
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {followUpModal && (
        <div className="followup-modal-overlay" onClick={closeFollowUpModal}>
          <form className="followup-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitFollowUpApproval}>
            <div className="followup-modal-header">
              <h3>Review Follow-Up</h3>
              <button
                type="button"
                className="modal-close"
                onClick={closeFollowUpModal}
                aria-label="Close modal"
              >
                &times;
              </button>
            </div>
            <div className="followup-modal-body">
              <p className="followup-placeholder">
                Sending to {followUpModal.task.counterpartEmail || 'unknown recipient'}
              </p>
              <label>
                Subject
                <input
                  type="text"
                  value={followUpModal.subject}
                  onChange={(event) =>
                    setFollowUpModal(prev => ({ ...prev, subject: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Send at
                <input
                  type="datetime-local"
                  value={followUpModal.sendAt || ''}
                  onChange={(event) =>
                    setFollowUpModal(prev => ({ ...prev, sendAt: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Message
                <textarea
                  value={followUpModal.body}
                  onChange={(event) =>
                    setFollowUpModal(prev => ({ ...prev, body: event.target.value }))
                  }
                  required
                />
              </label>
            </div>
            <div className="followup-modal-footer">
              <button type="button" className="btn btn-secondary" onClick={closeFollowUpModal}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={followUpActionId === followUpModal.task.id}
              >
                {followUpActionId === followUpModal.task.id ? 'Scheduling...' : 'Schedule send'}
              </button>
            </div>
          </form>
        </div>
      )}

      {actionModal && (
        <div className="action-modal-overlay" onClick={closeActionModal}>
          <div className="action-modal" onClick={(e) => e.stopPropagation()}>
            <div className="action-modal-header">
              <h3>
                {actionModal.type === 'draft_reply' && 'Draft Reply'}
                {actionModal.type === 'schedule_meeting' && 'Suggested Meeting Times'}
              </h3>
              <button className="modal-close" onClick={closeActionModal} aria-label="Close modal">
                &times;
              </button>
            </div>

            {actionModal.type === 'draft_reply' && (
              <div className="action-modal-body">
                <p className="action-modal-subtitle">
                  Reply to: {actionModal.email?.from || 'Unknown sender'}
                </p>
                <textarea className="draft-preview" readOnly value={actionModal.draft || ''} />
                <div className="action-modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(actionModal.draft || '')}
                  >
                    Copy Draft
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      await handleUndoAction({
                        actionId: actionModal.actionId,
                        emailId: actionModal.email?.emailId,
                        actionType: 'draft_reply'
                      });
                      closeActionModal();
                    }}
                  >
                    Undo Action
                  </button>
                  <button type="button" className="btn btn-primary" onClick={closeActionModal}>
                    Close
                  </button>
                </div>
              </div>
            )}

            {actionModal.type === 'schedule_meeting' && (
              <div className="action-modal-body">
                <p className="action-modal-subtitle">
                  Suggested windows for {actionModal.email?.from || 'the requester'}:
                </p>
                {actionModal.suggestions?.length ? (
                  <ul className="suggestions-list">
                    {actionModal.suggestions.map((slot, idx) => {
                      const start = new Date(slot.start);
                      const end = new Date(slot.end);
                      const label = `${start.toLocaleString()} -> ${end.toLocaleTimeString()}`;
                      return (
                        <li key={`${slot.start}-${idx}`}>
                          <span>{label}</span>
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => copyToClipboard(label)}
                          >
                            Copy
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p>No open times were available in the next week.</p>
                )}
                <div className="action-modal-footer">
                  {actionModal.suggestions?.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={async () => {
                        await handleUndoAction({
                          actionId: actionModal.actionId,
                          emailId: actionModal.email?.emailId,
                          actionType: 'schedule_meeting'
                        });
                        closeActionModal();
                      }}
                    >
                      Undo Action
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={closeActionModal}>
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!assistantOpen && (
        <button
          type="button"
          className="assistant-toggle"
          onClick={() => {
            setAssistantError(null);
            setAssistantOpen(true);
          }}
        >
          Ask VAAI
        </button>
      )}

      {assistantOpen && (
        <div className="assistant-chat">
          <div className="assistant-chat-header">
            <div>
              <h3>VAAI Assistant</h3>
              <span>Ask me to schedule meetings, summarise emails, or prep for events.</span>
            </div>
            <button
              type="button"
              className="assistant-close"
              onClick={toggleAssistant}
              aria-label="Close assistant"
            >
              &times;
            </button>
          </div>
          <div className="assistant-messages">
            {assistantMessages.map((msg, idx) => (
              <div key={idx} className={`assistant-message ${msg.role}`}>
                <div className="assistant-bubble">
                  {msg.content}
                  {msg.event && (
                    <div className="assistant-event">
                      <strong>{msg.event.summary}</strong>
                      <span>
                        {formatDateTimeReadable(
                          msg.event.start?.dateTime || msg.event.start?.date
                        )}
                      </span>
                      {msg.event.location && <span>{msg.event.location}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {assistantError && <div className="assistant-error">{assistantError}</div>}
          <form className="assistant-input" onSubmit={handleAssistantSubmit}>
            <input
              type="text"
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder="Describe what you need..."
              disabled={assistantLoading}
            />
            <button type="submit" className="btn btn-primary" disabled={assistantLoading}>
              {assistantLoading ? 'Thinking...' : 'Send'}
            </button>
          </form>
        </div>
      )}

      {actionToast && (
        <div className={`toast ${actionToast.error ? 'error' : ''}`}>
          <span>{actionToast.message}</span>
          <div className="toast-actions">
            {actionToast.undoAvailable && actionToast.actionId && (
              <button
                type="button"
                className="link-button"
                onClick={() => handleUndoAction(actionToast)}
              >
                Undo
              </button>
            )}
            <button
              type="button"
              className="toast-close"
              onClick={dismissToast}
              aria-label="Dismiss toast"
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

















