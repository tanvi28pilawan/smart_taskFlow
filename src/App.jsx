import { useEffect,useMemo, useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  KanbanSquare,
  BarChart3,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  Plus,
  Sparkles,
  MoreHorizontal,
  CalendarDays,
  Clock3,
  User,
  ListTodo,
  Timer,
  ChevronDown,
  LogOut,
} from 'lucide-react';

import './App.css';
import StatCard from './components/StatCard';
import Auth from "./Auth";
import smartTaskLogo from './assets/smarttaskflow-logo.png';

const API_URL = "http://localhost:5000/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem(
    "smartTaskflowToken"
  );

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

function normalizeApiTask(task) {
  const dueDate = task.dueDate
    ? new Date(task.dueDate).toISOString().slice(0, 10)
    : "";

  return {
    ...task,
    dueDate,
    date: dueDate,
    time: "",
    completed: task.status === "Completed",
  };
}
const SAMPLE_TASKS = [
  {
    id: 1,
    title: 'Finalize project presentation',
    date: 'Today', time: '5:00 PM', priority: 'High',
    category: 'Development', dueDate: 'Today', status: 'In Progress', completed: false,
  },
  {
    id: 2,
    title: 'Review design feedback',
    date: 'Today', time: '6:30 PM', priority: 'Medium',
    category: 'Design', dueDate: 'Aug 29', status: 'Todo', completed: false,
  },
  {
    id: 3,
    title: 'Update project documentation',
    date: 'Today', time: '2:15 PM', priority: 'Low',
    category: 'Documentation', dueDate: 'Aug 30', status: 'Completed', completed: true,
  },
  {
    id: 4,
    title: 'Prepare weekly report',
    date: 'Tomorrow', time: '10:00 AM', priority: 'Medium',
    category: 'Planning', dueDate: 'Tomorrow', status: 'Todo', completed: false,
  },
  {
    id: 5,
    title: 'Team standup meeting',
    date: 'Tomorrow', time: '11:30 AM', priority: 'High',
    category: 'Development', dueDate: 'Tomorrow', status: 'In Progress', completed: false,
  },
  {
    id: 6,
    title: 'Update website content',
    date: 'Friday', time: '3:00 PM', priority: 'Low',
    category: 'Documentation', dueDate: 'Friday', status: 'Review', completed: false,
  },
];

function analyzeTask(title, description, dueDate, priority) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();

  const hasKeyword = (keywords) =>
    keywords.some((keyword) => text.includes(keyword));

  let suggestedPriority = priority || 'Medium';
  let detectedCategory = null;

  if (hasKeyword(['urgent', 'asap', 'critical', 'immediately', 'today', 'tomorrow'])) {
    suggestedPriority = 'High';
  }

  if (hasKeyword(['bug', 'error', 'api', 'database', 'backend', 'frontend', 'login', 'code'])) {
    detectedCategory = 'Development';
  } else if (hasKeyword(['ui', 'ux', 'figma', 'design', 'color', 'layout'])) {
    detectedCategory = 'Design';
  } else if (hasKeyword(['test', 'testing', 'qa', 'verify'])) {
    detectedCategory = 'Testing';
  } else if (hasKeyword(['readme', 'documentation', 'report', 'document'])) {
    detectedCategory = 'Documentation';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let deadlineRisk = 'Low';
  let closeDueDate = false;

  if (dueDate) {
    const due = new Date(`${dueDate}T00:00:00`);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (due.getTime() === today.getTime() || due.getTime() === tomorrow.getTime()) {
      deadlineRisk = 'High';
      closeDueDate = true;
    }
  }

  let recommendedAction = 'Review the task details and plan the next step.';

  if (suggestedPriority === 'High' && closeDueDate) {
    recommendedAction = 'Start immediately and assign the task.';
  } else if (deadlineRisk === 'High') {
    recommendedAction = 'Prioritize this task and complete it soon.';
  } else if (suggestedPriority === 'High') {
    recommendedAction = 'Prioritize this task and start it soon.';
  } else if (detectedCategory) {
    recommendedAction = `Organize this ${detectedCategory.toLowerCase()} task and schedule the next step.`;
  }

  return {
    suggestedPriority,
    detectedCategory,
    deadlineRisk,
    recommendedAction,
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState(null);
const [authChecked, setAuthChecked] = useState(false);

useEffect(() => {
  try {
    const savedUser = localStorage.getItem('smartTaskflowUser');
    const savedToken = localStorage.getItem('smartTaskflowToken');

    if (savedUser && savedToken) {
      setCurrentUser(JSON.parse(savedUser));
    }
  } catch {
    setCurrentUser(null);
  } finally {
    setAuthChecked(true);
  }
}, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activePage, setActivePage] = useState('Dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [taskFilters, setTaskFilters] = useState({
    priority: 'All',
    category: 'All',
    dueDate: 'All',
  });
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Todo',
    category: 'Development',
    dueDate: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [priorityManuallySelected, setPriorityManuallySelected] = useState(false);
  const [categoryManuallySelected, setCategoryManuallySelected] = useState(false);
  const [taskAnalysis, setTaskAnalysis] = useState(null);
  const [aiTaskInput, setAiTaskInput] = useState('');
const [isAiPlanning, setIsAiPlanning] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskDetailsForm, setTaskDetailsForm] = useState({
    title: '',
    description: '',
    priority: 'Medium',
    status: 'Todo',
    category: 'Development',
    dueDate: '',
  });

  // ---- SETTINGS FORM STATE ----
  const [settingsForm, setSettingsForm] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    role: 'Workspace Admin',
    email_notifications: true,
    task_reminders: true,
    weekly_reports: true,
  });
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

 const [tasks, setTasks] = useState([]);
const [isLoadingTasks, setIsLoadingTasks] = useState(true);
const [apiError, setApiError] = useState("");

useEffect(() => {
  const loadTasks = async () => {
    try {
      setIsLoadingTasks(true);
      setApiError("");

      const response = await fetch(`${API_URL}/tasks`, {
        headers: getAuthHeaders(),
      });

      if (response.status === 401) {
        throw new Error("UNAUTHORIZED");
      }

      if (!response.ok) {
        throw new Error("Failed to fetch tasks.");
      }

      const result = await response.json();

      if (!result.success || !Array.isArray(result.data)) {
        throw new Error("Invalid tasks response.");
      }

      setTasks(result.data.map(normalizeApiTask));
    } catch (error) {
      console.error("Failed to load tasks:", error);

      if (error?.message === "UNAUTHORIZED") {
        localStorage.removeItem('smartTaskflowToken');
        localStorage.removeItem('smartTaskflowUser');
        setTasks([]);
        setCurrentUser(null);
        return;
      }

      setApiError(
        "Unable to load tasks. Please make sure the backend is running."
      );
    } finally {
      setIsLoadingTasks(false);
    }
  };

  loadTasks();
}, []); 

  // ---- LOAD SETTINGS FROM BACKEND ----
  useEffect(() => {
    if (!currentUser) return;

    const loadSettings = async () => {
      try {
        setIsLoadingSettings(true);

        const response = await fetch(`${API_URL}/settings`, {
          headers: getAuthHeaders(),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch settings.");
        }

        const result = await response.json();

        if (!result.success || !result.data) {
          throw new Error("Invalid settings response.");
        }

        setSettingsForm((current) => ({
          ...current,
          name: currentUser?.name || current.name,
          email: result.data.email || currentUser?.email || current.email,
          email_notifications: Boolean(result.data.email_notifications),
          task_reminders: Boolean(result.data.task_reminders),
          weekly_reports: Boolean(result.data.weekly_reports),
        }));
      } catch (error) {
        console.error("Failed to load settings:", error);
      } finally {
        setIsLoadingSettings(false);
      }
    };

    loadSettings();
  }, [currentUser]);

  const handleSettingsChange = (e) => {
    const { name, value, type, checked } = e.target;

    setSettingsForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));

    setSettingsMessage('');
  };

  const handleSaveSettings = async () => {
    try {
      setIsSavingSettings(true);
      setSettingsMessage('');

      const response = await fetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          email_notifications: settingsForm.email_notifications,
          task_reminders: settingsForm.task_reminders,
          weekly_reports: settingsForm.weekly_reports,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to save settings.');
      }

      setSettingsMessage('Settings saved successfully.');
    } catch (error) {
      console.error('Save settings error:', error);
      setSettingsMessage('Could not save settings. Please try again.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('smartTaskflowToken');
    localStorage.removeItem('smartTaskflowUser');

    setTasks([]);
    setSelectedTask(null);
    setTaskAnalysis(null);
    setIsTaskModalOpen(false);
    setSidebarOpen(false);
    setCurrentUser(null);
  };

  const navigationItems = [
    { name: 'Dashboard', icon: LayoutDashboard },
    { name: 'My Tasks', icon: CheckSquare },
    { name: 'Kanban Board', icon: KanbanSquare },
    { name: 'Analytics', icon: BarChart3 },
    { name: 'Settings', icon: Settings },
  ];
  const importantTasks = [
  {
    id: 1,
    title: 'Fix payment API bug',
    priority: 'High',
    dueDate: 'Due Today',
    category: 'Development',
  },
  {
    id: 2,
    title: 'Complete dashboard UI',
    priority: 'Medium',
    dueDate: 'Due Aug 29',
    category: 'Design',
  },
  {
    id: 3,
    title: 'Prepare GitHub README',
    priority: 'Low',
    dueDate: 'Due Aug 30',
    category: 'Documentation',
  },
];

  const completedCount = tasks.filter(
    (task) => task.completed
  ).length;

  const inProgressCount = tasks.filter(
    (task) => task.status === 'In Progress'
  ).length;

  const overdueCount = 2;

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const weekEnd = new Date(today);
    const daysUntilSunday = 7 - today.getDay();
    weekEnd.setDate(today.getDate() + daysUntilSunday);
    weekEnd.setHours(23, 59, 59, 999);

    const parseTaskDueDate = (task) => {
      const raw = String(task.dueDate || task.date || '').trim();
      const normalized = raw.replace(/^due\s+/i, '').trim().toLowerCase();

      if (normalized === 'today') return new Date(today);
      if (normalized === 'tomorrow') return new Date(tomorrow);

      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        parsed.setHours(0, 0, 0, 0);
        return parsed;
      }

      const parsedWithYear = new Date(`${normalized}, ${today.getFullYear()}`);
      if (!Number.isNaN(parsedWithYear.getTime())) {
        parsedWithYear.setHours(0, 0, 0, 0);
        return parsedWithYear;
      }

      return null;
    };

    return tasks.filter((task) => {
      const taskText = `${task.title || ''} ${task.description || ''}`.toLowerCase();
      const dueDate = parseTaskDueDate(task);

      const matchesSearch = !query || taskText.includes(query);
      const matchesPriority =
        taskFilters.priority === 'All' ||
        task.priority === taskFilters.priority;
      const matchesCategory =
        taskFilters.category === 'All' ||
        task.category === taskFilters.category;

      let matchesDueDate = true;

      if (taskFilters.dueDate === 'Due Today') {
        matchesDueDate = Boolean(
          dueDate && dueDate.getTime() === today.getTime()
        );
      } else if (taskFilters.dueDate === 'Due This Week') {
        matchesDueDate = Boolean(
          dueDate && dueDate >= today && dueDate <= weekEnd
        );
      } else if (taskFilters.dueDate === 'Overdue') {
        matchesDueDate = Boolean(dueDate && dueDate < today);
      }

      return (
        matchesSearch &&
        matchesPriority &&
        matchesCategory &&
        matchesDueDate
      );
    });
  }, [tasks, searchQuery, taskFilters]);

  const handleFilterChange = (name, value) => {
    setTaskFilters((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTaskFilters({
      priority: 'All',
      category: 'All',
      dueDate: 'All',
    });
  };

  const renderTaskFilters = () => (
    <div className="task-filters">
      <div className="filter-search">
        <Search size={17} />
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search tasks"
        />
      </div>

      <select
        value={taskFilters.priority}
        onChange={(e) => handleFilterChange('priority', e.target.value)}
        aria-label="Filter by priority"
      >
        <option value="All">All Priorities</option>
        <option value="High">High</option>
        <option value="Medium">Medium</option>
        <option value="Low">Low</option>
      </select>

      <select
        value={taskFilters.category}
        onChange={(e) => handleFilterChange('category', e.target.value)}
        aria-label="Filter by category"
      >
        <option value="All">All Categories</option>
        <option value="Development">Development</option>
        <option value="Design">Design</option>
        <option value="Testing">Testing</option>
        <option value="Documentation">Documentation</option>
      </select>

      <select
        value={taskFilters.dueDate}
        onChange={(e) => handleFilterChange('dueDate', e.target.value)}
        aria-label="Filter by due date"
      >
        <option value="All">All Due Dates</option>
        <option value="Due Today">Due Today</option>
        <option value="Due This Week">Due This Week</option>
        <option value="Overdue">Overdue</option>
      </select>

      <button
        type="button"
        className="clear-filters-button"
        onClick={clearFilters}
      >
        Clear Filters
      </button>
    </div>
  );

  const toggleTask = (id) => {
    const task = tasks.find((item) => item.id === id);

    if (!task) return;

    const newStatus =
      task.status === 'Completed'
        ? 'Todo'
        : 'Completed';

    handleStatusChange(id, newStatus);
  };

  const openTaskDetails = (task) => {
    setTaskAnalysis(null);
    setSelectedTask(task);
    setTaskDetailsForm({
      title: task.title || '',
      description: task.description || '',
      priority: task.priority || 'Medium',
      status: task.status || 'Todo',
      category: ['Development', 'Design', 'Testing', 'Documentation'].includes(task.category)
        ? task.category
        : 'Development',
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || '')
        ? task.dueDate
        : '',
    });
  };

  const handleTaskDetailsChange = (e) => {
    const { name, value } = e.target;
    setTaskDetailsForm((current) => ({ ...current, [name]: value }));
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();

    if (!selectedTask || !taskDetailsForm.title.trim() || !taskDetailsForm.dueDate) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: taskDetailsForm.title.trim(),
          description: taskDetailsForm.description.trim(),
          priority: taskDetailsForm.priority,
          status: taskDetailsForm.status,
          category: taskDetailsForm.category,
          dueDate: taskDetailsForm.dueDate,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update task.');
      }

      const updatedTask = normalizeApiTask(result.data);

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        )
      );

      setSelectedTask(null);
    } catch (error) {
      console.error('Update task error:', error);
      alert('Could not update the task. Please try again.');
    }
  };

  const handleDeleteTask = async () => {
    if (!selectedTask) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedTask.title}"?`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/tasks/${selectedTask.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to delete task.');
      }

      setTasks((currentTasks) =>
        currentTasks.filter((task) => task.id !== selectedTask.id)
      );

      setSelectedTask(null);
    } catch (error) {
      console.error('Delete task error:', error);
      alert('Could not delete the task. Please try again.');
    }
  };

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const response = await fetch(`${API_URL}/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update status.');
      }

      const updatedTask = normalizeApiTask(result.data);

      setTasks((currentTasks) =>
        currentTasks.map((task) =>
          task.id === updatedTask.id ? updatedTask : task
        )
      );

      if (selectedTask?.id === taskId) {
        setSelectedTask(updatedTask);

        setTaskDetailsForm((current) => ({
          ...current,
          status: newStatus,
        }));
      }
    } catch (error) {
      console.error('Status update error:', error);
      alert('Could not update the task status.');
    }
  };

  const openTaskModal = () => {
    setNewTask({
      title: '',
      description: '',
      priority: 'Medium',
      status: 'Todo',
      category: 'Development',
      dueDate: '',
    });
    setFormErrors({});
    setPriorityManuallySelected(false);
    setCategoryManuallySelected(false);
    setTaskAnalysis(null);
    setIsTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setFormErrors({});
  };

  const handleTaskInputChange = (e) => {
    const { name, value } = e.target;

    setNewTask((current) => ({ ...current, [name]: value }));

    if (name === 'priority') {
      setPriorityManuallySelected(true);
    }

    if (name === 'category') {
      setCategoryManuallySelected(true);
    }

    setFormErrors((current) => ({ ...current, [name]: '' }));
  };
const handleAIPlanTask = async () => {
  if (!aiTaskInput.trim()) {
    alert('Please describe your task first.');
    return;
  }

  try {
    setIsAiPlanning(true);

    const response = await fetch(`${API_URL}/ai/plan-task`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        task: aiTaskInput.trim(),
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || 'AI task planning failed.'
      );
    }

    const aiTask = result.data;

    setNewTask((current) => ({
      ...current,
      title: aiTask.title || current.title,
      description: aiTask.description || current.description,
      priority: aiTask.priority || current.priority,
      category: aiTask.category || current.category,
      dueDate: aiTask.dueDate || current.dueDate,
    }));

    setPriorityManuallySelected(false);
    setCategoryManuallySelected(false);

  } catch (error) {
    console.error('AI task planning error:', error);
    alert('Could not generate AI task suggestions.');
  } finally {
    setIsAiPlanning(false);
  }
};

  const addTask = async (e) => {
    e.preventDefault();
    const errors = {};

    if (!newTask.title.trim()) {
      errors.title = 'Task title is required.';
    }

    if (!newTask.dueDate) {
      errors.dueDate = 'Due date is required.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const analysis = analyzeTask(
      newTask.title,
      newTask.description,
      newTask.dueDate,
      newTask.priority
    );

    const finalPriority = priorityManuallySelected
      ? newTask.priority
      : analysis.suggestedPriority;

    const finalCategory = categoryManuallySelected
      ? newTask.category
      : analysis.detectedCategory || newTask.category;

    try {
      const response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: newTask.title.trim(),
          description: newTask.description.trim(),
          priority: finalPriority,
          status: newTask.status,
          category: finalCategory,
          dueDate: newTask.dueDate,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to create task.');
      }

      const task = normalizeApiTask(result.data);

      setTasks((currentTasks) => [...currentTasks, task]);

      setTaskAnalysis({
        ...analysis,
        taskId: task.id,
        suggestedPriority: finalPriority,
        detectedCategory: finalCategory,
      });

      setTaskDetailsForm({
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        category: task.category,
        dueDate: task.dueDate,
      });

      setSelectedTask(task);
      closeTaskModal();
    } catch (error) {
      console.error('Create task error:', error);
      alert('Could not create the task. Please try again.');
    }
  };

  const resetDemoData = async () => {
    const confirmed = window.confirm(
      'Are you sure you want to reset all tasks to the original demo data?'
    );

    if (!confirmed) return;

    try {
      const currentTasks = [...tasks];

      for (const task of currentTasks) {
        await fetch(`${API_URL}/tasks/${task.id}`, {
          method: 'DELETE',
        });
      }

      const demoTasks = [
        {
          title: 'Finalize project presentation',
          description: 'Prepare and finalize the project presentation.',
          priority: 'High',
          status: 'In Progress',
          category: 'Development',
          dueDate: new Date().toISOString().slice(0, 10),
        },
        {
          title: 'Review design feedback',
          description:
            'Review the latest feedback and update the dashboard design.',
          priority: 'Medium',
          status: 'Todo',
          category: 'Design',
          dueDate: new Date(Date.now() + 2 * 86400000)
            .toISOString()
            .slice(0, 10),
        },
        {
          title: 'Update project documentation',
          description: 'Update the project documentation and README.',
          priority: 'Low',
          status: 'Completed',
          category: 'Documentation',
          dueDate: new Date(Date.now() + 3 * 86400000)
            .toISOString()
            .slice(0, 10),
        },
      ];

      const createdTasks = [];

      for (const demoTask of demoTasks) {
        const response = await fetch(`${API_URL}/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(demoTask),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error('Failed to restore demo data.');
        }

        createdTasks.push(normalizeApiTask(result.data));
      }

      setTasks(createdTasks);
    } catch (error) {
      console.error('Reset demo data error:', error);
      alert('Could not reset demo data.');
    }
  };

  const renderDashboard = () => {
    return (
      <>
        <section className="welcome-section">
  <div>
    <h1>Welcome back, {currentUser?.name || 'there'} </h1>

    <p className="welcome-text">
      Here's what's happening with your tasks today.
    </p>
  </div>

          <button
            className="primary-button"
            onClick={openTaskModal}
          >
            <Plus size={17} />
            Add Task
          </button>
        </section>

       <section className="stats-grid">
  <StatCard
    icon={CheckSquare}
    label="Total Tasks"
    value={tasks.length}
    trend="+12% from last week"
    iconClass="stat-blue"
  />

  <StatCard
    icon={ListTodo}
    label="To Do"
    value={tasks.filter((task) => task.status === 'Todo' && !task.completed).length}
    trend="+8% from last week"
    iconClass="stat-purple"
  />

  <StatCard
    icon={Timer}
    label="In Progress"
    value={inProgressCount}
    trend="+15% from last week"
    iconClass="stat-orange"
  />

  <StatCard
    icon={CheckSquare}
    label="Completed"
    value={completedCount}
    trend="+10% from last week"
    iconClass="stat-green"
  />
</section>

        <section className="important-tasks-section">
          <div className="important-tasks-header">
            <div>
              <h3>Today's Important Tasks</h3>
              <p>Your priority work for today</p>
            </div>

            <button className="add-task-button" onClick={openTaskModal}>
              <Plus size={16} />
              Add Task
            </button>
          </div>

          <div className="important-task-list">
            {importantTasks.map((task) => (
              <div className="important-task-row" key={task.id}>
                <span className={`priority-dot ${task.priority.toLowerCase()}`} />

                <div className="important-task-details">
                  <strong>{task.title}</strong>
                  <span className="task-category">{task.category}</span>
                </div>

                <span className={`priority-badge ${task.priority.toLowerCase()}`}>
                  {task.priority}
                </span>

                <span className="task-due-date">{task.dueDate}</span>

                <button
                  className="task-menu"
                  aria-label={`More options for ${task.title}`}
                >
                  <MoreHorizontal size={19} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="content-grid">
          <div className="content-card">
            <div className="section-header">
              <div>
                <h3>Today's Tasks</h3>
                <p>Your priority tasks for today</p>
              </div>

              <button
                className="view-all"
                onClick={() => setActivePage('My Tasks')}
              >
                View all
              </button>
            </div>

            <div className="task-list">
              {tasks.slice(0, 3).map((task) => (
                <div
                  className={`task-row ${
                    task.completed
                      ? 'completed-task'
                      : ''
                  }`}
                  key={task.id}
                  onClick={() => openTaskDetails(task)}
                  role="button"
                  tabIndex={0}
                >
                  <button
                    className={`task-check ${
                      task.completed ? 'checked' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTask(task.id);
                    }}
                    aria-label={`Complete ${task.title}`}
                  >
                    {task.completed && '✓'}
                  </button>

                  <div className="task-details">
                    <strong>{task.title}</strong>

                    <span>
                      {task.completed
                        ? `Completed · ${task.time}`
                        : `${task.date} · ${task.time}`}
                    </span>
                  </div>

                  <span
                    className={`priority ${
                      task.completed
                        ? 'low'
                        : task.priority === 'High'
                          ? 'high'
                          : 'medium'
                    }`}
                  >
                    {task.completed
                      ? 'Done'
                      : task.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="content-card productivity-card">
            <div className="section-header">
              <div>
                <h3>Productivity</h3>
                <p>This week's progress</p>
              </div>
            </div>

            <div className="progress-wrapper">
              <div
                className="progress-circle"
                style={{
                  background:
                    'conic-gradient(#2563eb 0 78%, #e2e8f0 78% 100%)',
                }}
              >
                <div>
                  <strong>78%</strong>
                  <span>Complete</span>
                </div>
              </div>
            </div>

            <div className="productivity-stats">
              <div>
                <strong>42</strong>
                <span>Tasks completed</span>
              </div>

              <div>
                <strong>8.4h</strong>
                <span>Time tracked</span>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  };

  const renderMyTasks = () => {
    return (
      <>
        <section className="welcome-section">
          <div>
            <p className="greeting-small">Workspace</p>

            <h1>My Tasks</h1>

            <p className="welcome-text">
              Manage and track all your tasks.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={openTaskModal}
          >
            <Plus size={17} />
            Add Task
          </button>
        </section>

        {renderTaskFilters()}

        <section className="content-card">
          <div className="section-header">
            <div>
              <h3>All Tasks</h3>

              <p>
                {filteredTasks.length} task
                {filteredTasks.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>

          <div className="task-list">
            {filteredTasks.length === 0 ? (
              <div className="filter-empty-state">
                <ListTodo size={32} />
                <strong>No tasks found.</strong>
                <span>Try changing your filters.</span>
              </div>
            ) : (
              filteredTasks.map((task) => (
                <div
                  className={`task-row ${
                    task.completed
                      ? 'completed-task'
                      : ''
                  }`}
                  key={task.id}
                  onClick={() => openTaskDetails(task)}
                  role="button"
                  tabIndex={0}
                >
                  <button
                    className={`task-check ${
                      task.completed ? 'checked' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTask(task.id);
                    }}
                  >
                    {task.completed && '✓'}
                  </button>

                  <div className="task-details">
                    <strong>{task.title}</strong>

                    <span>
                      {task.date} · {task.time}
                    </span>
                  </div>

                  <span
                    className={`priority ${
                      task.completed
                        ? 'low'
                        : task.priority === 'High'
                          ? 'high'
                          : task.priority === 'Medium'
                            ? 'medium'
                            : 'low'
                    }`}
                  >
                    {task.completed
                      ? 'Done'
                      : task.priority}
                  </span>

                  <button className="task-menu">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      </>
    );
  };

  const renderKanban = () => {
    const columns = [
      'To Do',
      'In Progress',
      'Review',
      'Completed',
    ];

    return (
      <>
        <section className="welcome-section">
          <div>
            <p className="greeting-small">Workspace</p>

            <h1>Kanban Board</h1>

            <p className="welcome-text">
              Organize your workflow visually.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={openTaskModal}
          >
            <Plus size={17} />
            Create New Task
          </button>
        </section>

        {renderTaskFilters()}

        <section className="kanban-grid">
          {columns.map((status) => {
            const columnTasks = filteredTasks.filter((task) => {
              if (status === 'To Do') {
                return task.status === 'Todo' && !task.completed;
              }

              return task.status === status;
            });

            return (
              <div
                className="kanban-column"
                key={status}
              >
                <div className="kanban-header">
                  <div>
                    <h3>{status}</h3>
                    <span>{columnTasks.length}</span>
                  </div>

                  <button
                    onClick={openTaskModal}
                    aria-label={`Create task in ${status}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                <div className="kanban-task-list">
                  {columnTasks.map((task) => (
                    <div
                      className="kanban-card"
                      key={task.id}
                      onClick={() => openTaskDetails(task)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="kanban-card-top">
                        <span
                          className={`priority ${
                            task.priority === 'High'
                              ? 'high'
                              : task.priority === 'Medium'
                                ? 'medium'
                                : 'low'
                          }`}
                        >
                          {task.priority}
                        </span>

                        <div
                          className="kanban-card-actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            className="kanban-status-select"
                            value={task.status}
                            onChange={(e) =>
                              handleStatusChange(task.id, e.target.value)
                            }
                            aria-label={`Change status for ${task.title}`}
                          >
                            <option value="Todo">To Do</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Review">Review</option>
                            <option value="Completed">Completed</option>
                          </select>
                          <MoreHorizontal size={16} />
                        </div>
                      </div>

                      <h4>{task.title}</h4>

                      <span className="kanban-category">
                        {task.category}
                      </span>

                      <div className="kanban-card-bottom">
                        <CalendarDays size={13} />
                        <span>
                          {task.dueDate || task.date}
                        </span>
                      </div>
                    </div>
                  ))}

                  {columnTasks.length === 0 && (
                    <div className="kanban-empty">
                      No tasks in this column
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {filteredTasks.length === 0 && (
          <div className="filter-empty-state kanban-filter-empty">
            <ListTodo size={32} />
            <strong>No tasks found.</strong>
            <span>Try changing your filters.</span>
          </div>
        )}
      </>
    );
  };

  const renderAnalytics = () => {
    const chartData = [
      { day: 'Mon', value: 55 },
      { day: 'Tue', value: 72 },
      { day: 'Wed', value: 45 },
      { day: 'Thu', value: 85 },
      { day: 'Fri', value: 68 },
      { day: 'Sat', value: 38 },
      { day: 'Sun', value: 60 },
    ];

    return (
      <>
        <section className="welcome-section">
          <div>
            <p className="greeting-small">Insights</p>

            <h1>Analytics</h1>

            <p className="welcome-text">
              Track your productivity and performance.
            </p>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="dashboard-card">
            <div className="card-header">
              <span>Completion Rate</span>

              <div className="card-icon blue">
                <CheckSquare size={20} />
              </div>
            </div>

            <h2>78%</h2>

            <p className="positive">
              ↑ 6% this week
            </p>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <span>Tasks Completed</span>

              <div className="card-icon purple">
                <BarChart3 size={20} />
              </div>
            </div>

            <h2>{completedCount}</h2>

            <p className="positive">
              ↑ 8% this week
            </p>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <span>Time Tracked</span>

              <div className="card-icon orange">
                <Clock3 size={20} />
              </div>
            </div>

            <h2>8.4h</h2>

            <p className="neutral">
              This week
            </p>
          </div>

          <div className="dashboard-card">
            <div className="card-header">
              <span>Overdue</span>

              <div className="card-icon red">
                <Bell size={20} />
              </div>
            </div>

            <h2>{overdueCount}</h2>

            <p className="negative">
              Needs attention
            </p>
          </div>
        </section>

        <section className="content-card analytics-card">
          <div className="section-header">
            <div>
              <h3>Weekly Productivity</h3>

              <p>Tasks completed throughout the week</p>
            </div>
          </div>

          <div className="analytics-bars">
            {chartData.map((item) => (
              <div
                className="bar-item"
                key={item.day}
              >
                <span className="bar-value">
                  {item.value}%
                </span>

                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      height: `${item.value}%`,
                    }}
                  />
                </div>

                <span>{item.day}</span>
              </div>
            ))}
          </div>
        </section>
      </>
    );
  };

  const renderSettings = () => {
    return (
      <>
        <section className="welcome-section">
          <div>
            <p className="greeting-small">Workspace</p>

            <h1>Settings</h1>

            <p className="welcome-text">
              Manage your profile and preferences.
            </p>
          </div>
        </section>

        <section className="settings-grid">
          <div className="content-card settings-card">
            <div className="settings-title">
              <div className="avatar large-avatar">
                I
              </div>

              <div>
                <h3>Profile</h3>

                <p>
                  Update your personal information.
                </p>
              </div>
            </div>

            <div className="settings-form">
              <label>
                Full name
                <input
                  type="text"
                  name="name"
                  value={settingsForm.name}
                  onChange={handleSettingsChange}
                />
              </label>

              <label>
                Email
                <input
                  type="email"
                  name="email"
                  value={settingsForm.email}
                  onChange={handleSettingsChange}
                />
              </label>

              <label>
                Role
                <input
                  type="text"
                  name="role"
                  value={settingsForm.role}
                  onChange={handleSettingsChange}
                />
              </label>

              <button
                type="button"
                className="primary-button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings || isLoadingSettings}
              >
                {isSavingSettings ? 'Saving...' : 'Save Changes'}
              </button>

              {settingsMessage && (
                <small
                  style={{
                    color: settingsMessage.startsWith('Could not')
                      ? '#dc2626'
                      : '#16a34a',
                  }}
                >
                  {settingsMessage}
                </small>
              )}

              <button
                type="button"
                className="reset-demo-button"
                onClick={resetDemoData}
              >
                Reset Demo Data
              </button>
            </div>
          </div>

          <div className="content-card settings-card">
            <div className="settings-title">
              <div className="card-icon blue">
                <Settings size={21} />
              </div>

              <div>
                <h3>Preferences</h3>

                <p>
                  Customize your workspace experience.
                </p>
              </div>
            </div>

            <div className="settings-options">
              <label className="setting-option">
                <div>
                  <strong>Email notifications</strong>

                  <span>
                    Receive updates about your tasks.
                  </span>
                </div>

                <input
                  type="checkbox"
                  name="email_notifications"
                  checked={settingsForm.email_notifications}
                  onChange={handleSettingsChange}
                />
              </label>

              <label className="setting-option">
                <div>
                  <strong>Task reminders</strong>

                  <span>
                    Get reminders before deadlines.
                  </span>
                </div>

                <input
                  type="checkbox"
                  name="task_reminders"
                  checked={settingsForm.task_reminders}
                  onChange={handleSettingsChange}
                />
              </label>

              <label className="setting-option">
                <div>
                  <strong>Weekly reports</strong>

                  <span>
                    Receive your productivity summary.
                  </span>
                </div>

                <input
                  type="checkbox"
                  name="weekly_reports"
                  checked={settingsForm.weekly_reports}
                  onChange={handleSettingsChange}
                />
              </label>
            </div>
          </div>
        </section>
      </>
    );
  };

  const renderPage = () => {
    switch (activePage) {
      case 'My Tasks':
        return renderMyTasks();

      case 'Kanban Board':
        return renderKanban();

      case 'Analytics':
        return renderAnalytics();

      case 'Settings':
        return renderSettings();

      default:
        return renderDashboard();
    }
  };

  if (!authChecked) {
    return null;
  }

  if (!currentUser) {
    return (
      <Auth
        onLogin={(user) => {
          setCurrentUser(user);
        }}
      />
    );
  }

  return (
    <div className="app">
      {/* SIDEBAR */}

      <aside
        className={`sidebar ${
          sidebarOpen ? 'sidebar-open' : ''
        }`}
      >
        <div className="sidebar-header">
          <div className="logo">
    <img src={smartTaskLogo} alt="Smart TaskFlow" />
    <span>Smart TaskFlow</span>
</div>
          <button
            className="close-sidebar"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <p className="nav-label">MENU</p>

          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.name}
                className={`nav-item ${
                  activePage === item.name
                    ? 'active'
                    : ''
                }`}
                onClick={() => {
                  setActivePage(item.name);
                  setSidebarOpen(false);
                  setSearchQuery('');
                }}
              >
                <Icon
                  size={20}
                  strokeWidth={2}
                />

                <span>{item.name}</span>
              </button>
            );
          })}
        </nav>

        
      </aside>

      {/* MOBILE OVERLAY */}

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN */}

      <div className="main-wrapper">
        {/* NAVBAR */}

        <header className="top-navbar">
          <button
            className="menu-button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={24} />
          </button>

          <div className="search-box">
            <Search size={19} />

            <input
              type="text"
              placeholder="Search tasks, projects..."
              value={searchQuery}
              onChange={(e) =>
                setSearchQuery(e.target.value)
              }
            />

            <span className="search-shortcut">
              ⌘ K
            </span>
          </div>

          <div className="navbar-actions">
  <div className="profile-menu-wrapper">
              <button
                type="button"
                className="profile-button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Open profile menu"
              >
                <div className="avatar">
                  {(currentUser?.name || 'U').charAt(0).toUpperCase()}
                </div>

                <div className="profile-info">
                  <span className="profile-name">
                    {currentUser?.name || 'User'}
                  </span>

                  <span className="profile-role">
                    Workspace Admin
                  </span>
                </div>

                <ChevronDown
                  size={16}
                  className={`profile-chevron ${profileOpen ? 'open' : ''}`}
                />
              </button>

              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="dropdown-profile">
                    <div className="avatar dropdown-avatar">
                      {(currentUser?.name || 'U').charAt(0).toUpperCase()}
                    </div>

                    <div>
                      <strong>{currentUser?.name || 'User'}</strong>
                      <span>{currentUser?.email || 'No email available'}</span>
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setActivePage('Settings');
                      setProfileOpen(false);
                    }}
                  >
                    <User size={17} />
                    <span>My Profile</span>
                  </button>

                  <button
                    type="button"
                    className="dropdown-item logout-item"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut size={17} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* PAGE */}

        <main className="main-content">
          {searchQuery &&
          activePage !== 'My Tasks' ? (
            <>
              <section className="welcome-section">
                <div>
                  <p className="greeting-small">
                    Search results
                  </p>

                  <h1>
                    Results for "{searchQuery}"
                  </h1>

                  <p className="welcome-text">
                    Matching tasks from your workspace.
                  </p>
                </div>
              </section>

              <section className="content-card">
                <div className="task-list">
                  {filteredTasks.length === 0 ? (
                    <div
                      style={{
                        padding: '45px 10px',
                        textAlign: 'center',
                        color: '#94a3b8',
                      }}
                    >
                      No tasks found.
                    </div>
                  ) : (
                    filteredTasks.map((task) => (
                      <div
                        className={`task-row ${
                          task.completed
                            ? 'completed-task'
                            : ''
                        }`}
                        key={task.id}
                      >
                        <button
                          className={`task-check ${
                            task.completed
                              ? 'checked'
                              : ''
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTask(task.id);
                          }}
                        >
                          {task.completed && '✓'}
                        </button>

                        <div className="task-details">
                          <strong>
                            {task.title}
                          </strong>

                          <span>
                            {task.date} · {task.time}
                          </span>
                        </div>

                        <span
                          className={`priority ${
                            task.priority === 'High'
                              ? 'high'
                              : task.priority === 'Medium'
                                ? 'medium'
                                : 'low'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : (
            renderPage()
          )}
        </main>

        {selectedTask && (
          <div
            className="task-details-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedTask(null);
            }}
          >
            <div
              className="task-details-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="task-details-title"
            >
              <div className="task-details-header">
                <div>
                  <p>Task Details</p>
                  <h2 id="task-details-title">Edit Task</h2>
                </div>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setSelectedTask(null)}
                  aria-label="Close task details"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleUpdateTask}>
                <div className="task-details-body">
                  <div className="form-group">
                    <label htmlFor="details-title">Task title</label>
                    <input
                      id="details-title"
                      name="title"
                      type="text"
                      value={taskDetailsForm.title}
                      onChange={handleTaskDetailsChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="details-description">Description</label>
                    <textarea
                      id="details-description"
                      name="description"
                      rows="4"
                      placeholder="Add task description..."
                      value={taskDetailsForm.description}
                      onChange={handleTaskDetailsChange}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="details-priority">Priority</label>
                      <select
                        id="details-priority"
                        name="priority"
                        value={taskDetailsForm.priority}
                        onChange={handleTaskDetailsChange}
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="details-status">Status</label>
                      <select
                        id="details-status"
                        name="status"
                        value={taskDetailsForm.status}
                        onChange={handleTaskDetailsChange}
                      >
                        <option value="Todo">To Do</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Review">Review</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="details-category">Category</label>
                      <select
                        id="details-category"
                        name="category"
                        value={taskDetailsForm.category}
                        onChange={handleTaskDetailsChange}
                      >
                        <option value="Development">Development</option>
                        <option value="Design">Design</option>
                        <option value="Testing">Testing</option>
                        <option value="Documentation">Documentation</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="details-due-date">Due date</label>
                      <input
                        id="details-due-date"
                        name="dueDate"
                        type="date"
                        value={taskDetailsForm.dueDate}
                        onChange={handleTaskDetailsChange}
                        required
                      />
                    </div>
                  </div>
                </div>

                {taskAnalysis && selectedTask?.id === taskAnalysis.taskId && (
                  <div className="smart-analysis-panel">
                    <div className="smart-analysis-title">
                      <span>✨ Smart Task Analysis</span>
                    </div>

                    <div className="smart-analysis-grid">
                      <div>
                        <span>Suggested priority</span>
                        <strong>{taskAnalysis.suggestedPriority}</strong>
                      </div>
                      <div>
                        <span>Detected category</span>
                        <strong>{taskAnalysis.detectedCategory || 'No category detected'}</strong>
                      </div>
                      <div>
                        <span>Deadline risk</span>
                        <strong>{taskAnalysis.deadlineRisk}</strong>
                      </div>
                      <div className="smart-analysis-action">
                        <span>Recommended action</span>
                        <strong>{taskAnalysis.recommendedAction}</strong>
                      </div>
                    </div>

                    <small>Rule-based analysis — no external AI API used.</small>
                  </div>
                )}

                <div className="task-details-actions">
                  <button
                    type="button"
                    className="delete-task-button"
                    onClick={handleDeleteTask}
                  >
                    Delete Task
                  </button>

                  <div>
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={() => setSelectedTask(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="analyze-create-button"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {isTaskModalOpen && (
          <div
            className="modal-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) {
                closeTaskModal();
              }
            }}
          >
            <div
              className="create-task-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-task-title"
            >
              <div className="modal-header">
                <div>
                  <p className="modal-eyebrow">New task</p>
                  <h2 id="create-task-title">Create Task</h2>
                  <p>Add a task to your workflow.</p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={closeTaskModal}
                  aria-label="Close create task modal"
                >
                  <X size={20} />
                </button>
              </div>

              <form className="create-task-form" onSubmit={addTask}>
                <div className="ai-task-planner">
  <div className="ai-task-planner-header">
    <div>
      <strong>
        <Sparkles size={16} />
        AI Task Planner
      </strong>

      <span>
        Describe your task in natural language
      </span>
    </div>
  </div>

  <div className="ai-task-planner-input">
    <textarea
      rows="2"
      placeholder="e.g. Prepare project presentation by Friday"
      value={aiTaskInput}
      onChange={(e) => setAiTaskInput(e.target.value)}
    />

    <button
      type="button"
      className="ai-plan-button"
      onClick={handleAIPlanTask}
      disabled={isAiPlanning}
    >
      <Sparkles size={16} />

      {isAiPlanning
        ? 'Planning...'
        : 'Generate with AI'}
    </button>
  </div>
</div>

                <div className="form-group">
                  <label htmlFor="task-title">Task title <span>*</span></label>
                  <input
                    id="task-title"
                    name="title"
                    type="text"
                    placeholder="e.g. Fix payment API bug"
                    value={newTask.title}
                    onChange={handleTaskInputChange}
                    aria-invalid={Boolean(formErrors.title)}
                    aria-describedby={formErrors.title ? 'task-title-error' : undefined}
                  />
                  {formErrors.title && (
                    <small id="task-title-error" className="form-error">
                      {formErrors.title}
                    </small>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="task-description">Description</label>
                  <textarea
                    id="task-description"
                    name="description"
                    rows="3"
                    placeholder="Add some details about this task..."
                    value={newTask.description}
                    onChange={handleTaskInputChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="task-priority">Priority</label>
                    <select
                      id="task-priority"
                      name="priority"
                      value={newTask.priority}
                      onChange={handleTaskInputChange}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="task-status">Status</label>
                    <select
                      id="task-status"
                      name="status"
                      value={newTask.status}
                      onChange={handleTaskInputChange}
                    >
                      <option value="Todo">To Do</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Review">Review</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="task-category">Category</label>
                    <select
                      id="task-category"
                      name="category"
                      value={newTask.category}
                      onChange={handleTaskInputChange}
                    >
                      <option value="Development">Development</option>
                      <option value="Design">Design</option>
                      <option value="Testing">Testing</option>
                      <option value="Documentation">Documentation</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor="task-due-date">Due date <span>*</span></label>
                    <input
                      id="task-due-date"
                      name="dueDate"
                      type="date"
                      value={newTask.dueDate}
                      onChange={handleTaskInputChange}
                      aria-invalid={Boolean(formErrors.dueDate)}
                      aria-describedby={formErrors.dueDate ? 'task-due-date-error' : undefined}
                    />
                    {formErrors.dueDate && (
                      <small id="task-due-date-error" className="form-error">
                        {formErrors.dueDate}
                      </small>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="cancel-button" onClick={closeTaskModal}>
                    Cancel
                  </button>
                  <button type="submit" className="analyze-create-button">
                    ✨ Analyze &amp; Create
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;