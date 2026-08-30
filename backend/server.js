
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { GoogleGenAI } from '@google/genai';
import cron from "node-cron";
import { sendReminderEmail, sendResetPasswordEmail } from "./mailer.js";
import crypto from "crypto";
dotenv.config();
 
const app = express();
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
 
const models = await ai.models.list();
 
for await (const model of models) {
  console.log(model.name);
}
 
const PORT = process.env.PORT || 5000;
 
const JWT_SECRET =
  process.env.JWT_SECRET || "smart-taskflow-dev-secret";
 
app.use(
  cors({
    origin:
      process.env.CLIENT_URL || "http://localhost:5173",
  })
);
 
app.use(express.json());
 
const allowedPriorities = [
  "Low",
  "Medium",
  "High",
];
 
const allowedStatuses = [
  "Todo",
  "In Progress",
  "Review",
  "Completed",
];
 
const allowedCategories = [
  "Development",
  "Design",
  "Testing",
  "Documentation",
];
 
/* -------------------------------------------------
   HELPERS
------------------------------------------------- */
 
function validateTask(body) {
  const errors = {};
 
  if (!body.title?.trim()) {
    errors.title = "Task title is required.";
  }
 
  if (!body.dueDate) {
    errors.dueDate = "Due date is required.";
  }
 
  if (
    body.priority &&
    !allowedPriorities.includes(body.priority)
  ) {
    errors.priority = "Invalid priority.";
  }
 
  if (
    body.status &&
    !allowedStatuses.includes(body.status)
  ) {
    errors.status = "Invalid status.";
  }
 
  if (
    body.category &&
    !allowedCategories.includes(body.category)
  ) {
    errors.category = "Invalid category.";
  }
 
  return errors;
}
 
function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    status: task.status,
    category: task.category,
    dueDate: task.due_date,
    completed: task.status === "Completed",
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}
 
/* -------------------------------------------------
   DETERMINISTIC DATE RESOLUTION
   (We never trust the AI model to calculate the
   actual calendar date — it only classifies what
   the user said. JS does the arithmetic.)
------------------------------------------------- */
 
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
 
function formatDate(date) {
  return date.toISOString().split("T")[0];
}
 
function getNextWeekday(targetDayName, fromDate) {
  const targetIndex = WEEKDAYS.indexOf(
    String(targetDayName).toLowerCase()
  );
 
  if (targetIndex === -1) return null;
 
  const result = new Date(fromDate);
  const currentIndex = result.getDay();
 
  let daysToAdd = (targetIndex - currentIndex + 7) % 7;
 
  // If the user names today's own weekday (e.g. says "Friday" ON a
  // Friday), they mean the NEXT one, not today.
  if (daysToAdd === 0) daysToAdd = 7;
 
  result.setDate(result.getDate() + daysToAdd);
  return result;
}
 
function resolveDueDate(dateInfo, today) {
  if (!dateInfo || !dateInfo.type) return null;
 
  switch (dateInfo.type) {
    case "today":
      return formatDate(today);
 
    case "tomorrow": {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    }
 
    case "weekday": {
      const d = getNextWeekday(dateInfo.weekday, today);
      return d ? formatDate(d) : null;
    }
 
    case "in_n_days": {
      const days = Number(dateInfo.days);
      if (!Number.isFinite(days)) return null;
      const d = new Date(today);
      d.setDate(d.getDate() + days);
      return formatDate(d);
    }
 
    case "explicit_date":
      return dateInfo.date || null;
 
    case "none":
    default:
      return null;
  }
}
 
/* -------------------------------------------------
   AUTH MIDDLEWARE
------------------------------------------------- */
 
function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
 
  if (!authHeader) {
    return res.status(401).json({
      success: false,
      message: "Authentication required.",
    });
  }
 
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.split(" ")[1]
    : null;
 
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Invalid authorization format.",
    });
  }
 
  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );
 
    req.user = decoded;
 
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token.",
    });
  }
}
 
/* -------------------------------------------------
   AI TASK PLANNER
------------------------------------------------- */
 
app.post('/api/ai/plan-task', async (req, res) => {
  try {
    const { task } = req.body;
 
    if (!task?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Task description is required.',
      });
    }
 
    const today = new Date();
    const currentDate = formatDate(today);
    const currentDay = today.toLocaleDateString('en-US', {
      weekday: 'long',
    });
 
    const prompt = `
You are an AI task planning assistant for Smart TaskFlow.
 
Today is ${currentDay}, ${currentDate}.
 
Analyze the user's task description and generate a task plan.
 
User's task:
"${task}"
 
Rules:
- Extract a concise title and a useful description from the user's input.
- Choose priority from: Low, Medium, High.
- Choose category from: Development, Design, Testing, Documentation.
- Do NOT calculate the actual due date yourself. Instead, classify what
  the user said about timing into a "dateInfo" object as described below.
  A separate deterministic process will convert this into a real date.
 
For "dateInfo", return one of the following shapes depending on what the
user said:
 
- No date/deadline mentioned at all:
  { "type": "none" }
 
- User said "today":
  { "type": "today" }
 
- User said "tomorrow":
  { "type": "tomorrow" }
 
- User named a weekday (Monday, Tuesday, Wednesday, Thursday, Friday,
  Saturday, Sunday), e.g. "by Friday", "due Monday":
  { "type": "weekday", "weekday": "Friday" }
 
- User gave a relative offset in days, e.g. "in 3 days", "in a week"
  (a week = 7 days, two weeks = 14 days, etc.):
  { "type": "in_n_days", "days": 3 }
 
- User gave an explicit calendar date already in or convertible to
  YYYY-MM-DD format:
  { "type": "explicit_date", "date": "2026-09-15" }
 
Return ONLY valid JSON (no markdown fences, no commentary) in this exact
shape:
{
  "title": "string",
  "description": "string",
  "priority": "Low | Medium | High",
  "category": "Development | Design | Testing | Documentation",
  "dateInfo": { ... one of the shapes above ... }
}
`;
 
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    });
 
    const text = response.text.trim();
 
    const cleanedText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
 
    const aiTask = JSON.parse(cleanedText);
 

    // Deterministic date calculation happens here in JS, not in the model.
    const dueDate = resolveDueDate(aiTask.dateInfo, today);
 
    res.json({
      success: true,
      data: {
        title: aiTask.title,
        description: aiTask.description,
        priority: aiTask.priority,
        category: aiTask.category,
        dueDate,
      },
    });
  } catch (error) {
    console.error('Gemini AI task planning error:', error);
 
    res.status(500).json({
      success: false,
      message: 'AI task planning failed. Please try again.',
    });
  }
});
 
/* -------------------------------------------------
   SETTINGS
------------------------------------------------- */

app.get("/api/settings", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT email_notifications, task_reminders, weekly_reports, email
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("GET settings error:", error.message);
    res.status(500).json({ success: false, message: "Failed to fetch settings." });
  }
});

app.post("/api/settings", authenticateToken, async (req, res) => {
  try {
    const { email_notifications, task_reminders, weekly_reports } = req.body;

    const result = await pool.query(
      `UPDATE users
       SET email_notifications = $1, task_reminders = $2, weekly_reports = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING email_notifications, task_reminders, weekly_reports`,
      [email_notifications, task_reminders, weekly_reports, req.user.userId]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error("SAVE settings error:", error.message);
    res.status(500).json({ success: false, message: "Failed to save settings." });
  }
});

/* -------------------------------------------------
   EMAIL REMINDERS (CRON)
------------------------------------------------- */

async function sendDueTomorrowReminders() {
  const result = await pool.query(`
    SELECT t.id, t.title, t.description, t.due_date, u.email
    FROM tasks t
    JOIN users u ON t.user_id = u.id
    WHERE t.due_date::date = (CURRENT_DATE + INTERVAL '1 day')::date
      AND u.task_reminders = true
      AND t.status != 'Completed'
  `);

  let sentCount = 0;
  for (const task of result.rows) {
    try {
      await sendReminderEmail(task.email, task);
      sentCount++;
    } catch (err) {
      console.error(`Failed to send email for task ${task.id}:`, err.message);
    }
  }
  return sentCount;
}

cron.schedule("0 8 * * *", async () => {
  console.log("Running daily reminder job...");
  const count = await sendDueTomorrowReminders();
  console.log(`Reminders sent: ${count}`);
});

app.post("/api/test/send-reminders", authenticateToken, async (req, res) => {
  try {
    const count = await sendDueTomorrowReminders();
    res.json({ success: true, remindersSent: count });
  } catch (error) {
    console.error("Test reminder error:", error.message);
    res.status(500).json({ success: false, message: "Failed to send reminders." });
  }
});


/* -------------------------------------------------
   HEALTH CHECK
------------------------------------------------- */
 
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Smart TaskFlow API is running",
  });
});
 
/* -------------------------------------------------
   SIGN UP
------------------------------------------------- */
 
app.post("/api/auth/signup", async (req, res) => {
  try {
    const {
      name,
      email,
      password,
    } = req.body;
 
    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required.",
      });
    }
 
    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }
 
    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 6 characters.",
      });
    }
 
    const normalizedEmail =
      email.trim().toLowerCase();
 
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );
 
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          "An account with this email already exists.",
      });
    }
 
    const passwordHash = await bcrypt.hash(
      password,
      12
    );
 
    const result = await pool.query(
      `
      INSERT INTO users
      (name, email, password_hash)
      VALUES ($1, $2, $3)
      RETURNING id, name, email, created_at
      `,
      [
        name.trim(),
        normalizedEmail,
        passwordHash,
      ]
    );
 
    const user = result.rows[0];
 
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
 
    res.status(201).json({
      success: true,
      message:
        "Account created successfully.",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    console.error(
      "Signup error:",
      error.message
    );
 
    res.status(500).json({
      success: false,
      message: "Failed to create account.",
    });
  }
});
 
/* -------------------------------------------------
   LOGIN
------------------------------------------------- */
 
app.post("/api/auth/login", async (req, res) => {
  try {
    const {
      email,
      password,
    } = req.body;
 
    if (!email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Email and password are required.",
      });
    }
 
    const normalizedEmail =
      email.trim().toLowerCase();
 
    const result = await pool.query(
      `
      SELECT
        id,
        name,
        email,
        password_hash
      FROM users
      WHERE email = $1
      `,
      [normalizedEmail]
    );
 
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }
 
    const user = result.rows[0];
 
    const passwordMatches =
      await bcrypt.compare(
        password,
        user.password_hash
      );
 
    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }
 
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );
 
    res.json({
      success: true,
      message: "Login successful.",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      },
    });
  } catch (error) {
    console.error(
      "Login error:",
      error.message
    );
 
    res.status(500).json({
      success: false,
      message: "Failed to login.",
    });
  }
});
/* -------------------------------------------------
   FORGOT PASSWORD
------------------------------------------------- */

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    // Security: same response whether user exists or not
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        message: "If that email exists, a reset link has been sent.",
      });
    }

    const userId = result.rows[0].id;
    const token = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3`,
      [token, expiry, userId]
    );

    const resetLink = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password?token=${token}`;

    await sendResetPasswordEmail(normalizedEmail, resetLink);

    res.json({
      success: true,
      message: "If that email exists, a reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to process request.",
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: "Token and new password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const result = await pool.query(
      `SELECT id, reset_token_expiry FROM users WHERE reset_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset link.",
      });
    }

    const user = result.rows[0];

    if (new Date(user.reset_token_expiry) < new Date()) {
      return res.status(400).json({
        success: false,
        message: "This reset link has expired.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to reset password.",
    });
  }
});
 
/* -------------------------------------------------
   PROTECTED TASK ROUTES
------------------------------------------------- */
 
/* GET USER'S TASKS */
 
app.get(
  "/api/tasks",
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pool.query(
        `
        SELECT *
        FROM tasks
        WHERE user_id = $1
        ORDER BY id ASC
        `,
        [req.user.userId]
      );
 
      res.json({
        success: true,
        data: result.rows.map(formatTask),
      });
    } catch (error) {
      console.error(
        "GET tasks error:",
        error.message
      );
 
      res.status(500).json({
        success: false,
        message: "Failed to fetch tasks.",
      });
    }
  }
);
 
/* CREATE TASK */
 
app.post(
  "/api/tasks",
  authenticateToken,
  async (req, res) => {
    try {
      const errors = validateTask(
        req.body
      );
 
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed.",
          errors,
        });
      }
 
      const {
        title,
        description = "",
        priority = "Medium",
        status = "Todo",
        category = "Development",
        dueDate,
      } = req.body;
 
      const result = await pool.query(
        `
        INSERT INTO tasks
        (
          title,
          description,
          priority,
          status,
          category,
          due_date,
          user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        `,
        [
          title.trim(),
          description.trim(),
          priority,
          status,
          category,
          dueDate,
          req.user.userId,
        ]
      );
 
      res.status(201).json({
        success: true,
        data: formatTask(
          result.rows[0]
        ),
      });
    } catch (error) {
      console.error(
        "CREATE task error:",
        error.message
      );
 
      res.status(500).json({
        success: false,
        message: "Failed to create task.",
      });
    }
  }
);
 
/* UPDATE TASK */
 
app.put(
  "/api/tasks/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
 
      const errors = validateTask(
        req.body
      );
 
      if (Object.keys(errors).length > 0) {
        return res.status(400).json({
          success: false,
          message: "Validation failed.",
          errors,
        });
      }
 
      const {
        title,
        description = "",
        priority,
        status,
        category,
        dueDate,
      } = req.body;
 
      const result = await pool.query(
        `
        UPDATE tasks
        SET
          title = $1,
          description = $2,
          priority = $3,
          status = $4,
          category = $5,
          due_date = $6,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          id = $7
          AND user_id = $8
        RETURNING *
        `,
        [
          title.trim(),
          description.trim(),
          priority,
          status,
          category,
          dueDate,
          id,
          req.user.userId,
        ]
      );
 
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Task not found.",
        });
      }
 
      res.json({
        success: true,
        data: formatTask(
          result.rows[0]
        ),
      });
    } catch (error) {
      console.error(
        "UPDATE task error:",
        error.message
      );
 
      res.status(500).json({
        success: false,
        message: "Failed to update task.",
      });
    }
  }
);
 
/* CHANGE TASK STATUS */
 
app.patch(
  "/api/tasks/:id/status",
  authenticateToken,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
 
      const { status } = req.body;
 
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status.",
        });
      }
 
      const result = await pool.query(
        `
        UPDATE tasks
        SET
          status = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE
          id = $2
          AND user_id = $3
        RETURNING *
        `,
        [
          status,
          id,
          req.user.userId,
        ]
      );
 
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Task not found.",
        });
      }
 
      res.json({
        success: true,
        data: formatTask(
          result.rows[0]
        ),
      });
    } catch (error) {
      console.error(
        "STATUS update error:",
        error.message
      );
 
      res.status(500).json({
        success: false,
        message:
          "Failed to update task status.",
      });
    }
  }
);
 
/* DELETE TASK */
 
app.delete(
  "/api/tasks/:id",
  authenticateToken,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
 
      const result = await pool.query(
        `
        DELETE FROM tasks
        WHERE
          id = $1
          AND user_id = $2
        RETURNING *
        `,
        [
          id,
          req.user.userId,
        ]
      );
 
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Task not found.",
        });
      }
 
      res.json({
        success: true,
        data: formatTask(
          result.rows[0]
        ),
      });
    } catch (error) {
      console.error(
        "DELETE task error:",
        error.message
      );
 
      res.status(500).json({
        success: false,
        message:
          "Failed to delete task.",
      });
    }
  }
);
 
/* -------------------------------------------------
   UNKNOWN ROUTE
------------------------------------------------- */
 
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found.",
  });
});
 
/* -------------------------------------------------
   ERROR HANDLER
------------------------------------------------- */
 
app.use(
  (err, req, res, next) => {
    console.error(err);
 
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
);
 
/* -------------------------------------------------
   START SERVER
------------------------------------------------- */
 
pool
  .query("SELECT NOW()")
  .then(() => {
    console.log(
      "PostgreSQL connected successfully"
    );
 
    app.listen(PORT, () => {
      console.log(
        `Smart TaskFlow API running on http://localhost:${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      "PostgreSQL connection failed:",
      error.message
    );
  });
 
