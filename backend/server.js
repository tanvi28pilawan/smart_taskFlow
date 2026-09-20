import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "./db.js";
import { GoogleGenAI } from "@google/genai";
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

/* =================================================
   HELPERS
================================================= */

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

  return errors;
}

function formatTask(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description || "",
    priority: task.priority,
    status: task.status,

    categoryId: task.category_id,
    category: task.category_name || "",

    dueDate: task.due_date,
    completed: task.status === "Completed",
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

/* =================================================
   DATE HELPERS
================================================= */

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

  let daysToAdd =
    (targetIndex - currentIndex + 7) % 7;

  if (daysToAdd === 0) {
    daysToAdd = 7;
  }

  result.setDate(
    result.getDate() + daysToAdd
  );

  return result;
}

function resolveDueDate(dateInfo, today) {
  if (!dateInfo || !dateInfo.type) {
    return null;
  }

  switch (dateInfo.type) {
    case "today":
      return formatDate(today);

    case "tomorrow": {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    }

    case "weekday": {
      const d = getNextWeekday(
        dateInfo.weekday,
        today
      );

      return d ? formatDate(d) : null;
    }

    case "in_n_days": {
      const days = Number(dateInfo.days);

      if (!Number.isFinite(days)) {
        return null;
      }

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

/* =================================================
   AUTH MIDDLEWARE
================================================= */

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

/* =================================================
   AI TASK PLANNER
================================================= */

app.post(
  "/api/ai/plan-task",
  async (req, res) => {
    try {
      const { task } = req.body;

      if (!task?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Task description is required.",
        });
      }

      const today = new Date();

      const currentDate =
        formatDate(today);

      const currentDay =
        today.toLocaleDateString(
          "en-US",
          {
            weekday: "long",
          }
        );

      const prompt = `
You are an AI task planning assistant for Smart TaskFlow.

Today is ${currentDay}, ${currentDate}.

Analyze the user's task description and generate a task plan.

User's task:
"${task}"

Rules:
- Extract a concise title and a useful description.
- Choose priority from: Low, Medium, High.
- Choose category from: Development, Design, Testing, Documentation.
- Do NOT calculate the actual due date yourself.
- Instead classify the timing into a dateInfo object.

For dateInfo:

No date:
{ "type": "none" }

Today:
{ "type": "today" }

Tomorrow:
{ "type": "tomorrow" }

Weekday:
{ "type": "weekday", "weekday": "Friday" }

Relative days:
{ "type": "in_n_days", "days": 3 }

Explicit date:
{ "type": "explicit_date", "date": "2026-09-15" }

Return ONLY valid JSON:

{
  "title": "string",
  "description": "string",
  "priority": "Low | Medium | High",
  "category": "Development | Design | Testing | Documentation",
  "dateInfo": {}
}
`;

      const response =
        await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: prompt,
        });

      const text =
        response.text.trim();

      const cleanedText =
        text
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();

      const aiTask =
        JSON.parse(cleanedText);

      const dueDate =
        resolveDueDate(
          aiTask.dateInfo,
          today
        );

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
      console.error(
        "Gemini AI task planning error:",
        error
      );

      res.status(500).json({
        success: false,
        message:
          "AI task planning failed. Please try again.",
      });
    }
  }
);

/* =================================================
   SETTINGS
================================================= */

app.get(
  "/api/settings",
  authenticateToken,
  async (req, res) => {
    try {
      const [rows] =
        await pool.query(
          `SELECT
             email_notifications,
             task_reminders,
             weekly_reports,
             email
           FROM users
           WHERE id = ?`,
          [req.user.userId]
        );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error(
        "GET settings error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch settings.",
      });
    }
  }
);

app.post(
  "/api/settings",
  authenticateToken,
  async (req, res) => {
    try {
      const {
        email_notifications,
        task_reminders,
        weekly_reports,
      } = req.body;

      await pool.query(
        `UPDATE users
         SET email_notifications = ?,
             task_reminders = ?,
             weekly_reports = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          email_notifications,
          task_reminders,
          weekly_reports,
          req.user.userId,
        ]
      );

      const [rows] =
        await pool.query(
          `SELECT
             email_notifications,
             task_reminders,
             weekly_reports
           FROM users
           WHERE id = ?`,
          [req.user.userId]
        );

      res.json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error(
        "SAVE settings error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to save settings.",
      });
    }
  }
);

/* CATEGORIES */

// Get user's categories
app.get("/api/categories", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, created_at
       FROM categories
       WHERE user_id = ?
       ORDER BY name ASC`,
      [req.user.userId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET categories error:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories."
    });
  }
});


// Create a new category
app.post("/api/categories", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required."
      });
    }

    const categoryName = name.trim();

    const [existing] = await pool.query(
      `SELECT id
       FROM categories
       WHERE name = ? AND user_id = ?`,
      [categoryName, req.user.userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Category already exists."
      });
    }

    const [result] = await pool.query(
      `INSERT INTO categories (name, user_id)
       VALUES (?, ?)`,
      [categoryName, req.user.userId]
    );

    const [rows] = await pool.query(
      `SELECT id, name, created_at
       FROM categories
       WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error("CREATE category error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create category."
    });
  }
});


// Delete a category
app.delete("/api/categories/:id", authenticateToken, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);

    const [result] = await pool.query(
      `DELETE FROM categories
       WHERE id = ? AND user_id = ?`,
      [categoryId, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Category not found."
      });
    }

    res.json({
      success: true,
      message: "Category deleted successfully."
    });

  } catch (error) {
    console.error("DELETE category error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to delete category."
    });
  }
});
/* =================================================
   EMAIL REMINDERS
================================================= */

async function sendDueTomorrowReminders() {
  const [rows] =
    await pool.query(`
      SELECT
        t.id,
        t.title,
        t.description,
        t.due_date,
        u.email
      FROM tasks t
      JOIN users u
        ON t.user_id = u.id
      WHERE DATE(t.due_date)
            = DATE_ADD(
                CURDATE(),
                INTERVAL 1 DAY
              )
        AND u.task_reminders = 1
        AND t.status != 'Completed'
    `);

  let sentCount = 0;

  for (const task of rows) {
    try {
      await sendReminderEmail(
        task.email,
        task
      );

      sentCount++;
    } catch (err) {
      console.error(
        `Failed to send email for task ${task.id}:`,
        err.message
      );
    }
  }

  return sentCount;
}

cron.schedule(
  "0 8 * * *",
  async () => {
    console.log(
      "Running daily reminder job..."
    );

    try {
      const count =
        await sendDueTomorrowReminders();

      console.log(
        `Reminders sent: ${count}`
      );
    } catch (error) {
      console.error(
        "Daily reminder job failed:",
        error.message
      );
    }
  }
);

app.post(
  "/api/test/send-reminders",
  authenticateToken,
  async (req, res) => {
    try {
      const count =
        await sendDueTomorrowReminders();

      res.json({
        success: true,
        remindersSent: count,
      });
    } catch (error) {
      console.error(
        "Test reminder error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to send reminders.",
      });
    }
  }
);

/* =================================================
   HEALTH CHECK
================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      success: true,
      message:
        "Smart TaskFlow API is running",
    });
  }
);

/* =================================================
   SIGN UP
================================================= */

app.post(
  "/api/auth/signup",
  async (req, res) => {
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

      if (
        !password ||
        password.length < 6
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters.",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const [existingUsers] =
        await pool.query(
          `SELECT id
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        );

      if (existingUsers.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            "An account with this email already exists.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const [result] =
        await pool.query(
          `INSERT INTO users
           (name, email, password_hash)
           VALUES (?, ?, ?)`,
          [
            name.trim(),
            normalizedEmail,
            passwordHash,
          ]
        );

      const [userRows] =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             created_at
           FROM users
           WHERE id = ?`,
          [result.insertId]
        );

      const user = userRows[0];

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
        message:
          "Failed to create account.",
      });
    }
  }
);

/* =================================================
   LOGIN
================================================= */

app.post(
  "/api/auth/login",
  async (req, res) => {
    try {
      const {
        email,
        password,
      } = req.body;

      if (
        !email?.trim() ||
        !password
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Email and password are required.",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const [rows] =
        await pool.query(
          `SELECT
             id,
             name,
             email,
             password_hash
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        );

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
        });
      }

      const user = rows[0];

      const passwordMatches =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!passwordMatches) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid email or password.",
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
        message:
          "Login successful.",
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
  }
);

/* =================================================
   FORGOT PASSWORD
================================================= */

app.post(
  "/api/auth/forgot-password",
  async (req, res) => {
    try {
      const { email } = req.body;

      if (!email?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Email is required.",
        });
      }

      const normalizedEmail =
        email.trim().toLowerCase();

      const [rows] =
        await pool.query(
          `SELECT id
           FROM users
           WHERE email = ?`,
          [normalizedEmail]
        );

      if (rows.length === 0) {
        return res.json({
          success: true,
          message:
            "If that email exists, a reset link has been sent.",
        });
      }

      const userId = rows[0].id;

      const token =
        crypto
          .randomBytes(32)
          .toString("hex");

      const expiry =
        new Date(
          Date.now() +
          60 * 60 * 1000
        );

      await pool.query(
        `UPDATE users
         SET reset_token = ?,
             reset_token_expiry = ?
         WHERE id = ?`,
        [
          token,
          expiry,
          userId,
        ]
      );

      const resetLink =
        `${
          process.env.CLIENT_URL ||
          "http://localhost:5173"
        }/reset-password?token=${token}`;

      await sendResetPasswordEmail(
        normalizedEmail,
        resetLink
      );

      res.json({
        success: true,
        message:
          "If that email exists, a reset link has been sent.",
      });
    } catch (error) {
      console.error(
        "Forgot password error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to process request.",
      });
    }
  }
);

/* =================================================
   RESET PASSWORD
================================================= */

app.post(
  "/api/auth/reset-password",
  async (req, res) => {
    try {
      const {
        token,
        password,
      } = req.body;

      if (!token || !password) {
        return res.status(400).json({
          success: false,
          message:
            "Token and new password are required.",
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          success: false,
          message:
            "Password must be at least 6 characters.",
        });
      }

      const [rows] =
        await pool.query(
          `SELECT
             id,
             reset_token_expiry
           FROM users
           WHERE reset_token = ?`,
          [token]
        );

      if (rows.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid or expired reset link.",
        });
      }

      const user = rows[0];

      if (
        new Date(
          user.reset_token_expiry
        ) < new Date()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This reset link has expired.",
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      await pool.query(
        `UPDATE users
         SET password_hash = ?,
             reset_token = NULL,
             reset_token_expiry = NULL
         WHERE id = ?`,
        [
          passwordHash,
          user.id,
        ]
      );

      res.json({
        success: true,
        message:
          "Password reset successfully. You can now log in.",
      });
    } catch (error) {
      console.error(
        "Reset password error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to reset password.",
      });
    }
  }
);

/* =================================================
   GET USER TASKS
================================================= */

/* GET USER'S TASKS */

app.get("/api/tasks", authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.category_id,
        c.name AS category_name,
        t.due_date,
        t.user_id,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN categories c
        ON t.category_id = c.id
      WHERE t.user_id = ?
      ORDER BY t.id ASC
      `,
      [req.user.userId]
    );

    res.json({
      success: true,
      data: rows.map(formatTask),
    });

  } catch (error) {
    console.error("GET tasks error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tasks.",
    });
  }
});

/* =================================================
   CREATE TASK
================================================= */

/* CREATE TASK */

app.post("/api/tasks", authenticateToken, async (req, res) => {
  try {
    const errors = validateTask(req.body);

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
      categoryId,
      category,
      dueDate,
    } = req.body;

    let finalCategoryId = categoryId;

    // If frontend sends category name instead of categoryId
    if (!finalCategoryId && category?.trim()) {
      const [categoryRows] = await pool.query(
        `
        SELECT id
        FROM categories
        WHERE name = ? AND user_id = ?
        `,
        [category.trim(), req.user.userId]
      );

      if (categoryRows.length > 0) {
        finalCategoryId = categoryRows[0].id;
      } else {
        // Create the category for this user if it doesn't exist
        const [categoryResult] = await pool.query(
          `
          INSERT INTO categories (name, user_id)
          VALUES (?, ?)
          `,
          [category.trim(), req.user.userId]
        );

        finalCategoryId = categoryResult.insertId;
      }
    }

    if (!finalCategoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required.",
      });
    }

    // Make sure the category belongs to the logged-in user
    const [categoryCheck] = await pool.query(
      `
      SELECT id
      FROM categories
      WHERE id = ? AND user_id = ?
      `,
      [finalCategoryId, req.user.userId]
    );

    if (categoryCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Invalid category.",
      });
    }

    const [result] = await pool.query(
      `
      INSERT INTO tasks
      (
        title,
        description,
        priority,
        status,
        category_id,
        due_date,
        user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title.trim(),
        description.trim(),
        priority,
        status,
        finalCategoryId,
        dueDate,
        req.user.userId,
      ]
    );

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.category_id,
        c.name AS category_name,
        t.due_date,
        t.user_id,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN categories c
        ON t.category_id = c.id
      WHERE t.id = ?
      `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: formatTask(rows[0]),
    });

  } catch (error) {
    console.error("CREATE task error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to create task.",
    });
  }
});

/* =================================================
   UPDATE TASK
================================================= */

/* UPDATE TASK */

app.put("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const errors = validateTask(req.body);

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
      categoryId,
      category,
      dueDate,
    } = req.body;

    let finalCategoryId = categoryId;

    // Support category name if frontend still sends "category"
    if (!finalCategoryId && category?.trim()) {
      const [categoryRows] = await pool.query(
        `
        SELECT id
        FROM categories
        WHERE name = ? AND user_id = ?
        `,
        [category.trim(), req.user.userId]
      );

      if (categoryRows.length > 0) {
        finalCategoryId = categoryRows[0].id;
      } else {
        const [categoryResult] = await pool.query(
          `
          INSERT INTO categories (name, user_id)
          VALUES (?, ?)
          `,
          [category.trim(), req.user.userId]
        );

        finalCategoryId = categoryResult.insertId;
      }
    }

    if (!finalCategoryId) {
      return res.status(400).json({
        success: false,
        message: "Category is required.",
      });
    }

    // Verify category belongs to logged-in user
    const [categoryCheck] = await pool.query(
      `
      SELECT id
      FROM categories
      WHERE id = ? AND user_id = ?
      `,
      [finalCategoryId, req.user.userId]
    );

    if (categoryCheck.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Invalid category.",
      });
    }

    const [result] = await pool.query(
      `
      UPDATE tasks
      SET
        title = ?,
        description = ?,
        priority = ?,
        status = ?,
        category_id = ?,
        due_date = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      `,
      [
        title.trim(),
        description.trim(),
        priority,
        status,
        finalCategoryId,
        dueDate,
        id,
        req.user.userId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.category_id,
        c.name AS category_name,
        t.due_date,
        t.user_id,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      data: formatTask(rows[0]),
    });

  } catch (error) {
    console.error("UPDATE task error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to update task.",
    });
  }
});

/* =================================================
   CHANGE TASK STATUS
================================================= */

/* CHANGE TASK STATUS */

app.patch("/api/tasks/:id/status", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status.",
      });
    }

    const [result] = await pool.query(
      `
      UPDATE tasks
      SET
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
      `,
      [status, id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.title,
        t.description,
        t.priority,
        t.status,
        t.category_id,
        c.name AS category_name,
        t.due_date,
        t.user_id,
        t.created_at,
        t.updated_at
      FROM tasks t
      JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
      `,
      [id]
    );

    res.json({
      success: true,
      data: formatTask(rows[0]),
    });

  } catch (error) {
    console.error("STATUS update error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to update task status.",
    });
  }
});
/* =================================================
   DELETE TASK
================================================= */

/* DELETE TASK */

app.delete("/api/tasks/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [result] = await pool.query(
      `
      DELETE FROM tasks
      WHERE id = ? AND user_id = ?
      `,
      [id, req.user.userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Task not found.",
      });
    }

    res.json({
      success: true,
      message: "Task deleted successfully.",
    });

  } catch (error) {
    console.error("DELETE task error:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to delete task.",
    });
  }
});

/* -------------------------------------------------
   CATEGORIES
------------------------------------------------- */

// GET ALL CATEGORIES
app.get(
  "/api/categories",
  authenticateToken,
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `
        SELECT id, name
        FROM categories
        WHERE user_id = ?
        ORDER BY name ASC
        `,
        [req.user.userId]
      );

      res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error(
        "GET categories error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message: "Failed to load categories.",
      });
    }
  }
);


// CREATE CATEGORY
app.post(
  "/api/categories",
  authenticateToken,
  async (req, res) => {
    try {
      const name = req.body.name?.trim();

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Category name is required.",
        });
      }

      const [result] = await pool.query(
        `
        INSERT INTO categories (name, user_id)
        VALUES (?, ?)
        `,
        [name, req.user.userId]
      );

      const [rows] = await pool.query(
        `
        SELECT id, name
        FROM categories
        WHERE id = ?
          AND user_id = ?
        `,
        [result.insertId, req.user.userId]
      );

      res.status(201).json({
        success: true,
        data: rows[0],
      });

    } catch (error) {
      console.error(
        "CREATE category error:",
        error.message
      );

      // Duplicate category for same user
      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "This category already exists.",
        });
      }

      res.status(500).json({
        success: false,
        message: "Failed to create category.",
      });
    }
  }
);

/* =================================================
   UNKNOWN ROUTE
================================================= */

app.use(
  (req, res) => {
    res.status(404).json({
      success: false,
      message:
        "Route not found.",
    });
  }
);

/* =================================================
   ERROR HANDLER
================================================= */

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      success: false,
      message:
        "Internal server error.",
    });
  }
);

/* =================================================
   START SERVER
================================================= */

pool
  .query("SELECT NOW()")
  .then(() => {
    console.log(
      "MySQL connected successfully"
    );

    app.listen(
      PORT,
      () => {
        console.log(
          `Smart TaskFlow API running on http://localhost:${PORT}`
        );
      }
    );
  })
  .catch((error) => {
    console.error(
      "MySQL connection failed:",
      error.message
    );
  });