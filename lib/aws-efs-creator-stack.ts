import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as efs from 'aws-cdk-lib/aws-efs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { AwsEfsCreatorStackProps } from './AwsEfsCreatorStackProps';
import { parsePerformanceMode, parseThroughputMode } from '../utils/efs-mode-parsing';

/**
 * The AwsEfsCreatorStack class is responsible for creating and configuring the AWS EFS resources
 * necessary for the application. It sets up a VPC, security groups, and an EFS file system with
 * appropriate policies and outputs.
 */
export class AwsEfsCreatorStack extends cdk.Stack {
  /**
   * Constructs a new instance of the AwsEfsCreatorStack.
   * @param scope The scope in which to define this construct (usually `this` from a parent construct).
   * @param id A unique identifier for the construct within its scope.
   * @param props Configuration properties for the EFS stack, including resource prefixes, deployment environment, and VPC settings.
   */
  constructor(scope: Construct, id: string, props: AwsEfsCreatorStackProps) {
    super(scope, id, props);

    const vpc = ec2.Vpc.fromLookup(this, `${props.resourcePrefix}-VPC`, {
      vpcId: props.vpcId,
    });
    const removalPolicy = props.deployEnvironment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // define a security group for EFS
    const efsSG = new ec2.SecurityGroup(this, `${props.resourcePrefix}-efsSG`, {
      securityGroupName: `${props.resourcePrefix}-efsSG`,
      vpc: vpc,
      allowAllOutbound: true,
    });
    efsSG.applyRemovalPolicy(removalPolicy);

    // create an EFS File System
    const performanceMode = parsePerformanceMode(props.performanceMode);
    const throughputMode = parseThroughputMode(props.throughputMode);

    const efsFileSystem = new efs.FileSystem(this, `${props.resourcePrefix}-efsFileSystem`, {
      fileSystemName: `${props.resourcePrefix}-efsFileSystem`,
      vpc,
      removalPolicy,
      securityGroup: efsSG, // Ensure this security group allows NFS traffic from the ECS tasks
      encrypted: true, // Enable encryption at rest
      performanceMode, // For AI application, HCP application, Analytics application, and media processing workflows we should use MAX_IO
      allowAnonymousAccess: false, // Disable anonymous access
      throughputMode,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_90_DAYS, // After 3 months, if a file is not accessed for given days, it will move to EFS Infrequent Access.
    });

    // add EFS access policy
    efsFileSystem.addToResourcePolicy(
        new iam.PolicyStatement({
            actions: ['elasticfilesystem:ClientMount'],
            principals: [new iam.AnyPrincipal()],
            conditions: {
                Bool: {
                    'elasticfilesystem:AccessedViaMountTarget': 'true'
                }
            },
        }),
    );

    // export efsSG id
    new cdk.CfnOutput(this, 'efsSG', {
      value: efsSG.securityGroupId,
      exportName: `${props.resourcePrefix}-efsSG`,
      description: 'The security group id for the EFS file system.',
    });

    // export efsFileSystem id
    new cdk.CfnOutput(this, 'efsFileSystemId', {
      value: efsFileSystem.fileSystemId,
      exportName: `${props.resourcePrefix}-efsFileSystemId`,
      description: 'The file system id for the EFS file system.',
    });
  }
}
