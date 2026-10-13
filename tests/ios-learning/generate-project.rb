# Requires xcodeproj (installed with CocoaPods). Generates only an unsigned XCTest runner.
require 'xcodeproj'
require 'fileutils'
output = ARGV.fetch(0)
runner_name = ARGV.fetch(1, 'PassportLearningQA')
source_path = ARGV.fetch(2, File.expand_path('PassportLearningQA.swift', __dir__))
bundle_id = ARGV.fetch(3, 'local.passport.learning.qa')
FileUtils.mkdir_p(output)
project = Xcodeproj::Project.new(File.join(output, "#{runner_name}.xcodeproj"))
target = project.new_target(:ui_test_bundle, runner_name, :ios, '17.0')
source = project.new_file(source_path)
target.add_file_references([source])
target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_test_target(target)
scheme.test_action.should_use_launch_scheme_args_env = false
scheme.save_as(project.path, runner_name, true)
