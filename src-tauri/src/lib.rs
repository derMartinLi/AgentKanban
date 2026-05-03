pub mod domain;
pub mod commands;
pub mod events;
pub mod git_ops;
pub mod harness;
pub mod storage;
pub mod task_runner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app_state = task_runner::AppState::new().expect("failed to initialize application state");

  tauri::Builder::default()
    .manage(app_state)
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::default_projects_root,
      commands::detect_cli_tools,
      commands::find_projects,
      commands::list_registered_projects,
      commands::discover_projects,
      commands::register_project,
      commands::list_tasks,
      commands::create_task,
      commands::start_task,
      commands::retry_task,
      commands::answer_question,
      commands::approve_task,
      commands::reject_task,
      commands::load_task_logs,
      commands::load_harness_config,
      commands::save_harness_config,
      commands::get_task
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
